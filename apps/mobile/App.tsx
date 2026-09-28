import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RecipeListScreen } from "./src/screens/recipes";

export default function App(): React.JSX.Element {
    return (
        <SafeAreaProvider>
            <RecipeListScreen />
        </SafeAreaProvider>
    );
}