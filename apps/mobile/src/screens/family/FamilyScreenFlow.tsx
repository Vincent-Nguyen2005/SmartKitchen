import React, { useState } from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, Text } from "react-native";
import { useSession } from "../../services/session";
import CreateOrJoinFamilyScreen from "./CreateOrJoinFamilyScreen";
import FamilyOverviewScreen from "./FamilyOverviewScreen";
import ManageMembersScreen from "./ManageMembersScreen";

type View = "overview" | "setup" | "members";

/** A drop-in family flow that binds the existing presentation screens to the live APIs. */
export default function FamilyScreenFlow(): React.JSX.Element {
  const session = useSession();
  const [view, setView] = useState<View>("overview");
  const [familyError, setFamilyError] = useState("");

  if (!session.ready) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator color="#2F6B5F" size="large" /></SafeAreaView>;
  }
  if (!session.user) {
    return <SafeAreaView style={styles.loading}><Text style={styles.message}>Sign in to view your family.</Text></SafeAreaView>;
  }

  if (view === "setup") {
    return <CreateOrJoinFamilyScreen
      onBack={() => setView("overview")}
      onCreate={async (name) => { await session.createFamily(name); setFamilyError(""); setView("overview"); }}
      onJoin={async (code) => { await session.joinFamily(code); setFamilyError(""); setView("overview"); }}
    />;
  }

  if (view === "members" && session.family) {
    return <ManageMembersScreen
      members={session.family.members}
      currentUserRole={session.family.currentUserRole}
      currentUserId={session.user.id}
      onBack={() => setView("overview")}
      onChangeRole={session.updateMemberRole}
      onRemove={session.removeMember}
    />;
  }

  return <FamilyOverviewScreen
    family={session.family}
    error={familyError}
    onRefresh={async () => { try { await session.loadFamily(); setFamilyError(""); } catch { setFamilyError("Unable to load family details."); } }}
    onCreateOrJoin={() => setView("setup")}
    onManageMembers={() => setView("members")}
    onLeave={async () => { await session.leaveFamily(); setView("overview"); }}
    onRegenerateJoinCode={async () => {
      try { await session.regenerateJoinCode(); setFamilyError(""); }
      catch { setFamilyError("Unable to generate a new join code."); }
    }}
  />;
}

const styles = StyleSheet.create({
  loading: { alignItems: "center", backgroundColor: "#F7F8F4", flex: 1, justifyContent: "center" },
  message: { color: "#68736F", fontSize: 15 },
});
