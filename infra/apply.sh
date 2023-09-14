#!/bin/bash
set -euo pipefail

npx cdktf synth
npx cdktf deploy "RemoteBackendHandlerStack" --ignore-missing-stack-dependencies --auto-approve --app 'echo ""'
npx cdktf deploy "*" --ignore-missing-stack-dependencies --auto-approve --app 'echo ""'