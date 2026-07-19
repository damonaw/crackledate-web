#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
repo_dir="$(CDPATH= cd -- "$script_dir/.." && pwd -P)"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/crackledate-stateless-test.XXXXXX")"
scratch="$(CDPATH= cd -- "$scratch" && pwd -P)"
trap 'rm -rf "$scratch"' EXIT

context=default
host=unix:///var/run/docker.sock
project=crackledate-site
service=crackledate-site
container_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
image_id=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
revision=cccccccccccccccccccccccccccccccccccccccc

new_subject() {
  local name="$1" subject="$scratch/$1"
  mkdir -p "$subject/bin" "$subject/docker-config" "$subject/project"
  : >"$subject/env"
  : >"$subject/project/docker-compose.yml"
  cp "$repo_dir/scripts/verify_stateless_deployment_identity.sh" "$subject/verify.sh"
  chmod +x "$subject/verify.sh"
  printf '%s\n' "${2:-}" >"$subject/mutation"
  cat >"$subject/bin/docker" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
subject="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)"
mutation="$(cat "$subject/mutation")"
args=" $* "
emit() { [[ "$mutation" == "$1" ]] && printf '%s\n' "$3" || printf '%s\n' "$2"; }
case "$args" in
  *' context inspect '*) emit context 'default|unix:///var/run/docker.sock' 'bad|tcp://bad' ;;
  *' compose '*' ps --all --quiet '*) emit compose 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd' ;;
  *'org.opencontainers.image.revision'*) emit revision 'cccccccccccccccccccccccccccccccccccccccc' wrong ;;
  *'com.docker.compose.project.working_dir'*) emit working "$subject/project" /wrong ;;
  *'com.docker.compose.project.config_files'*) emit config "$subject/project/docker-compose.yml" /wrong ;;
  *'com.docker.compose.project'*) emit project crackledate-site wrong ;;
  *'com.docker.compose.service'*) emit service crackledate-site wrong ;;
  *'{{.Id}}'*) emit container aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd ;;
  *'{{.Image}}'*) emit image sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd ;;
  *'{{len .Mounts}}'*) emit mounts 0 1 ;;
  *'RestartPolicy.Name'*) emit restart unless-stopped always ;;
  *'{{.State.Status}}'*) emit state running exited ;;
  *'range .Config.Env'*) [[ "$mutation" == env ]] && printf 'SUBMISSIONS_PATH=/data/submissions.db\n' || printf 'PORT=8080\n' ;;
  *' exec '*) [[ "$mutation" != artifacts ]] ;;
  *) exit 2 ;;
esac
FAKE
  chmod +x "$subject/bin/docker"
  printf '%s\n' "$subject"
}

run() {
  local subject="$1"
  env -i PATH="$subject/bin:/usr/bin:/bin" PRIVATE_SENTINEL=do-not-leak \
    "$subject/verify.sh" \
    --docker-context "$context" --docker-host "$host" --docker-config "$subject/docker-config" \
    --env-file "$subject/env" --compose-file "$subject/project/docker-compose.yml" \
    --project-directory "$subject/project" --project-name "$project" --service "$service" \
    --container-id "$container_id" --image-id "$image_id" --revision "$revision" \
    --restart-policy unless-stopped --expected-state running
}

valid="$(new_subject valid)"
[[ "$(run "$valid")" == 'stateless deployment identity verified' ]] || exit 1
for mutation in context compose revision working config project service container image mounts restart state env artifacts; do
  subject="$(new_subject "$mutation" "$mutation")"
  if run "$subject" >/dev/null 2>&1; then
    printf 'identity mutation accepted: %s\n' "$mutation" >&2
    exit 1
  fi
done
printf 'stateless deployment identity self-tests passed\n'
