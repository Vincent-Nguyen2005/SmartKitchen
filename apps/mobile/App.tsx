import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { InventoryListScreen } from "./src/screens/inventory";

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <InventoryListScreen />
    </SafeAreaProvider>
  );
}
