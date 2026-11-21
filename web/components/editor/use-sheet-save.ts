"use client";

import { useEffect, useRef, useState } from "react";
import { hashElementsVersion } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { APIError, apiFetch, getSession } from "@/lib/api/client";
import type { Json } from "@/lib/json";

/**
 * Saving a sheet to My diagrams, by hand and by itself.
 *
 * The editor and Studio save the same way, so it is written once: a Save
 * button that asks for an account, a switch that saves on its own once a
 * change has sat still, and a record of what the sheet was when it was last
 * saved so that opening one is never mistaken for a change worth saving.
 */

export type SaveState = "idle" | "saving" | "saved" | "error";

/** Where this browser remembers whether auto-save is on. */
const AUTO_SAVE_KEY = "tingraph.autosave";
/** How often auto-save looks at the sheet; a change has to sit this long first. */
const AUTO_SAVE_TICK = 1500;

function readAutoSave(): boolean {
  try {
    return window.localStorage.getItem(AUTO_SAVE_KEY) === "on";
  } catch {
    return false;
  }
}

function writeAutoSave(on: boolean): void {
  try {
    window.localStorage.setItem(AUTO_SAVE_KEY, on ? "on" : "off");
  } catch {
    // a browser that keeps no storage still auto-saves; it just forgets the
    // choice when the tab closes
  }
}

export interface SheetSaveOptions {
  api: ExcalidrawImperativeAPI | null;
  /** the saved diagram this sheet already is, or null for a new one */
  initialId: string | null;
  /** the revision it was opened at, so a save made over someone else's is refused */
  initialRevision?: number | null;
  /**
   * The token of the shared link this sheet was opened through, for an
   * editor who is not the owner: saves go to that link, never to a diagram
   * of their own, and the address is left alone.
   */
  shared?: string | null;
  /** everything a save writes besides the scene, as one line */
  extra: () => string;
  /** the row a save writes */
  build: () => { title: string; category: string; document: Json };
  /** the address the saved sheet answers to from now on */
  locate: (url: URL, id: string) => void;
  /** asks a reader without an account to make one; null when they have none */
  requireAccount: (title: string, message: string) => Promise<unknown | null>;
  /** what this sheet is called in the sign-up dialogs: "diagram" or "Studio sheet" */
  noun: string;
  onSaved?: (id: string) => void;
}

export function useSheetSave({
  api,
  initialId,
  initialRevision = null,
  shared = null,
  extra,
  build,
  locate,
  requireAccount,
  noun,
  onSaved,
}: SheetSaveOptions) {
  const [savedId, setSavedId] = useState(initialId);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [autoSave, setAutoSave] = useState(readAutoSave);
  /** what the sheet was when it was last saved, or opened: the clean state */
  const savedSigRef = useRef<string | null>(null);
  /** a sheet that just failed to save, so auto-save waits for a new change */
  const failedSigRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  /** the revision the sheet was last opened or saved at */
  const revisionRef = useRef<number | null>(initialRevision);

  /**
   * Everything a save writes, in one line: the sheet's elements and files, and
   * whatever else the sheet keeps beside them. Two equal signatures are one save.
   */
  const signature = (): string | null => {
    if (!api) {
      return null;
    }
    return [
      hashElementsVersion(api.getSceneElementsIncludingDeleted()),
      Object.keys(api.getFiles()).sort().join(","),
      extra(),
    ].join("|");
  };

  const turnAutoSave = (on: boolean) => {
    setAutoSave(on);
    writeAutoSave(on);
  };

  const save = async ({ auto = false }: { auto?: boolean } = {}) => {
    if (!api || savingRef.current) {
      return;
    }
    if (auto) {
      // nobody is at the keyboard to answer a sign-up dialog: a session that
      // has run out turns auto-save off and says so on the Save button
      const session = await getSession().catch(() => null);
      if (!session?.user) {
        turnAutoSave(false);
        setSaveState("error");
        setSaveMessage("Sign in again to keep auto-saving. Auto-save is off.");
        return;
      }
    } else {
      const account =
        shared !== null
          ? await requireAccount(
              `Sign in to save this shared ${noun}`,
              `Your changes are saved into the ${noun} the link was shared from. Saving it needs an account; it does not use any of your saved-diagram space.`,
            )
          : await requireAccount(
              `Sign up to save your ${noun}`,
              `Saving needs an account. The Free plan stores up to 2 diagrams; Premium stores up to 100.`,
            );
      if (!account) return;
    }

    // what is being written; a change made while it is on its way stays
    // unsaved, and auto-save takes it on the next round
    const written = signature();
    savingRef.current = true;
    setSaveState("saving");
    setSaveMessage(`Saving ${noun}…`);
    try {
      const values = build();
      const existing = shared !== null || savedId !== null;
      const response = await apiFetch(
        shared !== null
          ? `/api/v1/shared/${encodeURIComponent(shared)}`
          : savedId
            ? `/api/v1/diagrams/${encodeURIComponent(savedId)}`
            : "/api/v1/diagrams",
        {
          method: existing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            existing && revisionRef.current !== null
              ? { ...values, revision: revisionRef.current }
              : values,
          ),
        },
      );
      if (!response.ok) {
        const error = await APIError.from(response);
        failedSigRef.current = written;
        setSaveState("error");
        // none of these is mended by trying again, so auto-save stops
        const final = [403, 404, 409, 412].includes(error.status);
        if (final && auto) {
          turnAutoSave(false);
        }
        const off = final && auto ? " Auto-save is off." : "";
        setSaveMessage(
          error.status === 412
            ? `Someone else saved this ${noun} since you opened it. Reload to see their version; your changes here are not saved.${off}`
            : error.status === 409
              ? `Saved-diagram limit reached for your plan.${off}`
              : shared !== null && error.status === 403
                ? `This link is view-only now; your changes are not saved.${off}`
                : shared !== null && error.status === 404
                  ? `This link has been turned off; your changes are not saved.${off}`
                  : `${noun[0].toUpperCase()}${noun.slice(1)} could not be saved. Try again.`,
        );
        return;
      }
      const data = (await response.json()) as { id?: string; revision?: number };
      revisionRef.current = typeof data.revision === "number" ? data.revision : revisionRef.current;
      savedSigRef.current = written;
      failedSigRef.current = null;
      setSaveState("saved");
      if (shared !== null) {
        // the owner's diagram, saved through the link: no address of our own
        setSaveMessage(auto ? "Auto-saved to the shared diagram." : "Saved to the shared diagram.");
        return;
      }
      const id = data.id ?? savedId ?? "";
      setSavedId(id);
      onSaved?.(id);
      setSaveMessage(auto ? "Auto-saved to My diagrams." : "Saved to My diagrams.");
      const url = new URL(window.location.href);
      locate(url, id);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      failedSigRef.current = written;
      setSaveState("error");
      setSaveMessage(`${noun[0].toUpperCase()}${noun.slice(1)} could not be saved. Try again.`);
    } finally {
      savingRef.current = false;
    }
  };

  // the latest save, for the auto-save timer to call: the one it closed over
  // would still think a fresh sheet had never been saved, and save it twice
  const saveRef = useRef(save);
  const signatureRef = useRef(signature);
  useEffect(() => {
    saveRef.current = save;
    signatureRef.current = signature;
  });

  // the clean state is the sheet as it opened, once its first settling pass is
  // done — a template's connectors adopt their routes then — so opening a
  // diagram, or a notation, is never mistaken for a change worth saving
  useEffect(() => {
    if (!api) {
      return;
    }
    const handle = setTimeout(() => {
      savedSigRef.current ??= signatureRef.current();
    }, 800);
    return () => clearTimeout(handle);
  }, [api]);

  // auto-save: a change that has sat still for a whole tick is written. One
  // still moving under the hand changes the signature every tick, so a drag
  // is saved once, when it ends, rather than every frame
  useEffect(() => {
    if (!autoSave || !api) {
      return;
    }
    let seen: string | null = null;
    const handle = setInterval(() => {
      const now = signatureRef.current();
      if (!now || savingRef.current || savedSigRef.current === null) {
        return;
      }
      const changed = now !== savedSigRef.current && now !== failedSigRef.current;
      if (changed && now === seen) {
        void saveRef.current({ auto: true });
      }
      seen = now;
    }, AUTO_SAVE_TICK);
    return () => clearInterval(handle);
  }, [autoSave, api]);

  /** The switch beside Save: on needs an account, and saves what is unsaved. */
  const toggleAutoSave = async () => {
    if (autoSave) {
      turnAutoSave(false);
      setSaveMessage("Auto-save is off.");
      return;
    }
    const account =
      shared !== null
        ? await requireAccount(
            `Sign in to auto-save this shared ${noun}`,
            `Auto-save writes your changes into the ${noun} the link was shared from as you work, so it needs an account.`,
          )
        : await requireAccount(
            `Sign up to auto-save your ${noun}`,
            `Auto-save keeps your ${noun} in My diagrams as you work, so it needs an account. The Free plan stores up to 2 diagrams; Premium stores up to 100.`,
          );
    if (!account) return;
    turnAutoSave(true);
    failedSigRef.current = null;
    setSaveMessage("Auto-save is on.");
  };

  useEffect(() => {
    if (saveState !== "saved") {
      return;
    }
    const handle = setTimeout(() => setSaveState("idle"), 2000);
    return () => clearTimeout(handle);
  }, [saveState]);

  return { savedId, saveState, saveMessage, autoSave, save, toggleAutoSave };
}
