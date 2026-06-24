set -euo pipefail

if ! command -v make >/dev/null || ! command -v curl >/dev/null || ! command -v python3 >/dev/null; then
  sudo apt-get update
  sudo apt-get install -y make curl python3
fi

for project in api frontend external-api; do
  npm ci --prefix "$project"
done

echo "Dev container ready. Run 'make up && make wait-backend && make seed && make urls' from the repository root."
