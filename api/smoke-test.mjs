import process from "node:process";

const baseUrl = process.env.API_BASE_URL ?? "http://localhost:8787";

async function run() {
  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();

  if (!response.ok) {
    console.error("Health check failed:", body);
    process.exitCode = 1;
    return;
  }

  console.log("Health check passed.");
  console.log(JSON.stringify(body, null, 2));
}

run().catch((error) => {
  console.error("Smoke test failed.");
  console.error(error.message);
  process.exitCode = 1;
});

