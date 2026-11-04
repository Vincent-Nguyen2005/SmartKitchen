import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import InventoryScreen from "./src/screens/inventory/InventoryListScreen";
import ShoppingCartScreen from "./src/screens/shopping-cart/ShoppingCartScreen";

type Tab = "inventory" | "shopping";

export default function App() {
  const [tab, setTab] = useState<Tab>("inventory");

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>SmartKitchen</Text>
        </View>

        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, tab === "inventory" && styles.tabActive]}
            onPress={() => setTab("inventory")}
          >
            <Text
              style={[
                styles.tabText,
                tab === "inventory" && styles.tabTextActive,
              ]}
            >
              📦 Kho
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === "shopping" && styles.tabActive]}
            onPress={() => setTab("shopping")}
          >
            <Text
              style={[
                styles.tabText,
                tab === "shopping" && styles.tabTextActive,
              ]}
            >
              🛒 Đi chợ
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {tab === "inventory" ? <InventoryScreen /> : <ShoppingCartScreen />}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { padding: 12, backgroundColor: "#007AFF", alignItems: "center" },
  headerText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  tab: {
    flex: 1,
    padding: 14,
    alignItems: "center",
    backgroundColor: "#fafafa",
  },
  tabActive: {
    backgroundColor: "#fff",
    borderBottomWidth: 3,
    borderBottomColor: "#007AFF",
  },
  tabText: { fontSize: 14, fontWeight: "600", color: "#888" },
  tabTextActive: { color: "#007AFF" },
  content: { flex: 1 },
});
