"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getAccountPresenceKey,
  getOnlineAccountKeys,
  type AccountPresenceRole,
} from "@/lib/chat/presence";

const ACCOUNT_PRESENCE_CHANNEL = "jyotishsetu-account-presence";
const AccountPresenceContext = createContext<ReadonlySet<string>>(new Set());

export function useAccountPresence() {
  return useContext(AccountPresenceContext);
}

export function AccountPresenceProvider({
  role,
  userId,
  children,
}: {
  role: AccountPresenceRole;
  userId: string;
  children: ReactNode;
}) {
  const [onlineAccounts, setOnlineAccounts] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(ACCOUNT_PRESENCE_CHANNEL, {
      config: { presence: { key: getAccountPresenceKey(role, userId) } },
    });

    const syncPresence = () => {
      setOnlineAccounts(getOnlineAccountKeys(channel.presenceState()));
    };

    channel.on("presence", { event: "sync" }, syncPresence);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel
          .track({ role, userId })
          .then((result) => {
            if (result !== "ok") {
              console.warn("[Account presence] Failed to publish online status:", result);
            }
          })
          .catch((error: unknown) => {
            console.error("[Account presence] Failed to publish online status:", error);
          });
        syncPresence();
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        setOnlineAccounts(new Set());
      }
    });

    return () => {
      setOnlineAccounts(new Set());
      void supabase.removeChannel(channel);
    };
  }, [role, userId]);

  return (
    <AccountPresenceContext.Provider value={onlineAccounts}>
      {children}
    </AccountPresenceContext.Provider>
  );
}
