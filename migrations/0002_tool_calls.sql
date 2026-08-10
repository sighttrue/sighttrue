-- How often each tool is called, and nothing else.
--
-- The site promises the MCP server needs no account and imposes no quota, and
-- this keeps that promise: one row per tool per day, holding a count. No
-- caller, no key, no address, no time beyond the date. There is nothing here
-- that could identify who asked, because nothing here is written per request.
--
-- Why count at all: usage is the only evidence that any of this is being used,
-- and every other figure this project publishes is a measurement of somebody
-- else. This is the one it can take of itself, and refusing to take it would be
-- the same incuriosity it points at in other people's dashboards.
--
-- Free tools are counted too. They are the ones most likely to be called, and
-- a usage figure that omitted them would understate the server to flatter the
-- paid tier.

CREATE TABLE IF NOT EXISTS tool_calls (
  -- Tool name as `mcp-catalogue.ts` spells it.
  tool           TEXT    NOT NULL,

  -- YYYY-MM-DD, UTC. The finest grain kept: an hour would start to describe
  -- when one caller works, and a day cannot.
  day            TEXT    NOT NULL,

  calls          INTEGER NOT NULL DEFAULT 0 CHECK (calls >= 0),

  PRIMARY KEY (tool, day)
);

CREATE INDEX IF NOT EXISTS tool_calls_day ON tool_calls (day);
