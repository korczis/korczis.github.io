#!/usr/bin/env bash
# Registers a dedicated self-hosted runner for this repository on lundra, the way algoglyph's
# ADR 0003 does: label lundra-korczis-hub, user ghrunner, install /home/ghrunner/runner-korczis-hub,
# HOME /home/ghrunner/home-korczis-hub, a systemd unit. Binaries are hard links of algoglyph's
# runner (same version, no download). Then points Pages at it (repo variable PAGES_RUNNER).
# Idempotent: an existing runner directory is left as it is.
#
# usage (owner, from this Mac):  bash scripts/lundra-runner.sh
# remove:                        ssh lundra 'cd /home/ghrunner/runner-korczis-hub &&
#                                  sudo ./svc.sh uninstall && sudo -u ghrunner ./config.sh remove --token <removal token>'
#                                gh variable delete PAGES_RUNNER -R korczis/korczis.github.io
set -euo pipefail
REPO=korczis/korczis.github.io
NAME=lundra-korczis-hub
SRC=/home/ghrunner/runner-algoglyph

token=$(gh api -X POST "repos/$REPO/actions/runners/registration-token" --jq .token)

ssh lundra "sudo -u ghrunner bash -s" <<REMOTE
set -euo pipefail
cd /home/ghrunner
if [ -e runner-korczis-hub/.runner ]; then echo "runner-korczis-hub already configured"; exit 0; fi
mkdir -p runner-korczis-hub home-korczis-hub
cd runner-korczis-hub
bin=\$(readlink $SRC/bin); ext=\$(readlink $SRC/externals)
cp -al "\$bin" "\$ext" .
ln -sfn "/home/ghrunner/runner-korczis-hub/\$(basename "\$bin")" bin
ln -sfn "/home/ghrunner/runner-korczis-hub/\$(basename "\$ext")" externals
cp $SRC/{config.sh,env.sh,run.sh,run-helper.cmd.template,run-helper.sh.template,safe_sleep.sh,svc.sh} .
printf 'LANG=en_US.UTF-8\nHOME=/home/ghrunner/home-korczis-hub\n' > .env
cp $SRC/.path .
./config.sh --unattended --url https://github.com/$REPO --token "$token" \
  --name $NAME --labels $NAME --work _work --replace
REMOTE

ssh lundra "cd /home/ghrunner/runner-korczis-hub && sudo ./svc.sh install ghrunner && sudo ./svc.sh start"
gh variable set PAGES_RUNNER -R "$REPO" --body "$NAME"
gh api "repos/$REPO/actions/runners" --jq '.runners[] | "\(.name) \(.status) \(.labels | map(.name) | join(","))"'
