import type { DbStatus } from "./db";

export type Health = { version: string; commit_sha: string; db: DbStatus };

export function buildHealth(db: DbStatus): Health {
  return {
    version: process.env.APP_VERSION ?? "0.0.0",
    commit_sha: process.env.COMMIT_SHA ?? "local",
    db,
  };
}
