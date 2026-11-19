import React, { useEffect, useState } from "react";
import { ActivityIndicator, AppState, SafeAreaView, StyleSheet, Text } from "react-native";
import { useSession } from "../../services/session";
import { typography } from "../../theme";
import CreateOrJoinFamilyScreen from "./CreateOrJoinFamilyScreen";
import FamilyOverviewScreen from "./FamilyOverviewScreen";
import ManageMembersScreen from "./ManageMembersScreen";
import FamilySettingsScreen from "./FamilySettingsScreen";

type View = "overview" | "setup" | "members" | "settings";

/** A drop-in family flow that binds the existing presentation screens to the live APIs. */
export default function FamilyScreenFlow(): React.JSX.Element {
  const session = useSession();
  const [view, setView] = useState<View>("overview");
  const [familyError, setFamilyError] = useState("");

  useEffect(() => {
    if (!session.ready || !session.user) return;
    const refresh = () => { void session.loadFamily().catch(() => undefined); };
    refresh();
    const timer = setInterval(() => {
      if (AppState.currentState === "active") refresh();
    }, 15000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [session.ready, session.user?.id, session.loadFamily]);

  if (!session.ready) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator color="#2F6B5F" size="large" /></SafeAreaView>;
  }
  if (!session.user) {
    return <SafeAreaView style={styles.loading}><Text style={styles.message}>Sign in to view your family.</Text></SafeAreaView>;
  }

  // Keep the signed-in member in sync with the profile shown in the account sheet.
  const currentUser = session.user;
  const family = session.family && {
    ...session.family,
    members: session.family.members.map((member) => member.userId === currentUser.id
      ? { ...member, displayName: currentUser.fullName?.trim() || member.displayName || currentUser.email.split("@")[0], avatarUrl: currentUser.avatarUrl || member.avatarUrl }
      : member),
  };

  if (view === "setup") {
    return <CreateOrJoinFamilyScreen
      onBack={() => setView("overview")}
      onCreate={async (name) => { await session.createFamily(name); setFamilyError(""); setView("overview"); }}
      onJoin={async (code) => { await session.joinFamily(code); setFamilyError(""); setView("overview"); }}
    />;
  }

  if (view === "members" && family) {
    return <ManageMembersScreen
      members={family.members}
      currentUserRole={family.currentUserRole}
      currentUserId={session.user.id}
      onBack={() => setView("overview")}
      onChangeRole={session.updateMemberRole}
      onRemove={session.removeMember}
      onTransferOwnership={session.transferOwnership}
    />;
  }

  if (view === "settings" && session.family) {
    return <FamilySettingsScreen
      settings={session.familySettings}
      onBack={() => setView("overview")}
      onSave={session.updateFamilySettings}
    />;
  }

  return <FamilyOverviewScreen
    family={family}
    error={familyError}
    onCreateOrJoin={() => setView("setup")}
    onManageMembers={() => setView("members")}
    onManageSettings={() => setView("settings")}
    onLeave={async () => { await session.leaveFamily(); setView("overview"); }}
    onRegenerateJoinCode={async () => {
      try { await session.regenerateJoinCode(); setFamilyError(""); }
      catch { setFamilyError("Không thể tạo mã mời mới. Vui lòng thử lại."); }
    }}
  />;
}

const styles = StyleSheet.create({
  loading: { alignItems: "center", backgroundColor: "#F7F8F4", flex: 1, justifyContent: "center" },
  message: { color: "#68736F", fontSize: typography.body.fontSize },
});
