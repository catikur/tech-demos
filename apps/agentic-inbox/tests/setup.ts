// Runs before every test file (bunfig.toml → [test].preload).
process.env.MOCK_AGENT_PACE_MS = "0";
process.env.SCHEDULER_ENABLED = "0";
process.env.LLM_PROVIDER = "mock";
process.env.DATA_DIR = "/tmp/agentic-inbox-test-data";
