import streamDeck from "@elgato/streamdeck";

import { NextWaiting } from "./actions/next-waiting";
import { SessionSlot } from "./actions/session-slot";
import { SysMonitor } from "./actions/sys-monitor";
import { SERVER_HOST, SERVER_PORT } from "./config";
import { Deck } from "./deck";
import { RegistryWatcher } from "./registry";
import { startServer } from "./server";
import { SessionStore } from "./sessions";

streamDeck.logger.setLevel("info");
const log = streamDeck.logger.createScope("agent-deck");

// SDK 3's default settings events need Stream Deck 7.1; the legacy behavior works from 6.4 up
// (onDidReceiveSettings also fires after our own setSettings, which is harmless here).
streamDeck.settings.useLegacySettingsBehavior = true;

const store = new SessionStore();
const deck = new Deck(store, log);

const slot = new SessionSlot(deck);
const next = new NextWaiting(deck);
deck.attach(slot, next);

streamDeck.actions.registerAction(slot);
streamDeck.actions.registerAction(next);
streamDeck.actions.registerAction(new SysMonitor(log));

// Hook events (WSL / Windows hook scripts) arrive over HTTP; POST /focus presses a key remotely ...
startServer(store, SERVER_HOST, SERVER_PORT, log, { focus: (key) => deck.focusKey(key) });
// ... and native sessions are also discovered from Claude Code's own session registry.
new RegistryWatcher(store, log).start();

streamDeck.connect();
