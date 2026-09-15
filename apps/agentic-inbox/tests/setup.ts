// Runs before every test file (bunfig.toml → [test].preload).
process.env.MOCK_AGENT_PACE_MS = "0";
process.env.SCHEDULER_ENABLED = "0";
process.env.LLM_PROVIDER = "mock";
process.env.DATA_DIR = "/tmp/agentic-inbox-test-data";
process.env.LOGIN_REQUIRED = "0";
delete process.env.OPENROUTER_API_KEY;
delete process.env.OPENROUTER_BASE_URL;

