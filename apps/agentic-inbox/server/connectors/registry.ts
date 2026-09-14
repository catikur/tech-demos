import type { Account } from "../../shared/types.ts";
import { DemoConnector, DEMO_PERSONAL_ACCOUNT_ID } from "./demo.ts";
import { M365Connector } from "./m365.ts";
import type { Connector } from "./types.ts";

type Factory = (account: Account) => Connector;

const factories = new Map<string, Factory>();

export function registerConnector(provider: string, factory: Factory): void {
  factories.set(provider, factory);
}

registerConnector("demo", (account) =>
  new DemoConnector(account.id === DEMO_PERSONAL_ACCOUNT_ID ? "personal" : "work"),
);

registerConnector("m365", () => new M365Connector());

export function connectorFor(account: Account): Connector {
  const factory = factories.get(account.provider);
  if (!factory) throw new Error(`No connector registered for provider "${account.provider}"`);
  return factory(account);
}
