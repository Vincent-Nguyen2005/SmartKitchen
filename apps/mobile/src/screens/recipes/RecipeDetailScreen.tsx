import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Recipe } from "./types";

const fallbackRecipe: Recipe = {
    id: "lemon-chicken",
    title: "Lemon herb roast chicken",
    description: "Golden, crisp-edged chicken with lemon, garlic, and fragrant garden herbs. A relaxed centerpiece for a table of friends.",
    imageUrl: "https://images.unsplash.com/photo-1532550907401-a500c9a57435?w=1200&q=90",
    categories: ["Dinner", "High protein"],
    prepTimeMinutes: 15,
    cookTimeMinutes: 55,
    servings: 4,
    difficulty: "EASY",
    ingredients: [
        { name: "Chicken thighs", quantity: "800", unit: "g" },
        { name: "Lemon", quantity: "1", unit: "whole" },
        { name: "Garlic", quantity: "4", unit: "cloves", notes: "Crushed" },
        { name: "Rosemary", quantity: "2", unit: "sprigs" },
        { name: "Olive oil", quantity: "2", unit: "tbsp" },
    ],
    steps: [
        "Heat the oven to 200 C and pat the chicken dry.",
        "Toss the chicken with lemon, garlic, rosemary, olive oil, salt, and pepper.",
        "Roast until golden and cooked through, about 50 to 55 minutes.",
    ],
};

type Props = {
    recipe?: Recipe;
    onBack?: () => void;
};

export default function RecipeDetailScreen({ recipe = fallbackRecipe, onBack }: Props): React.JSX.Element {
    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.hero}>
                    <Image source={{ uri: recipe.imageUrl }} style={styles.heroImage} />
                    <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
                        <Text style={styles.backText}>BACK TO RECIPES</Text>
                    </Pressable>
                    <View style={styles.heroCaption}>
                        <Text style={styles.heroEyebrow}>{recipe.categories.join("  /  ").toUpperCase()}</Text>
                        <Text style={styles.title}>{recipe.title}</Text>
                    </View>
                </View>

                <View style={styles.body}>
                    <Text style={styles.description}>{recipe.description}</Text>
                    <View style={styles.stats}>
                        <View style={styles.stat}><Text style={styles.statValue}>{recipe.prepTimeMinutes + recipe.cookTimeMinutes}</Text><Text style={styles.statLabel}>MINUTES</Text></View>
                        <View style={styles.statRule} />
                        <View style={styles.stat}><Text style={styles.statValue}>{recipe.servings}</Text><Text style={styles.statLabel}>SERVINGS</Text></View>
                        <View style={styles.statRule} />
                        <View style={styles.stat}><Text style={styles.statValue}>{recipe.difficulty.toLowerCase()}</Text><Text style={styles.statLabel}>EFFORT</Text></View>
                    </View>

                    <View style={styles.sectionHeading}>
                        <Text style={styles.sectionTitle}>Ingredients</Text>
                        <Text style={styles.sectionNote}>{recipe.ingredients.length} ITEMS</Text>
                    </View>
                    {recipe.ingredients.map((ingredient, index) => (
                        <View key={`${ingredient.name}-${index}`} style={styles.ingredientRow}>
                            <View style={styles.ingredientBullet} />
                            <Text style={styles.ingredientName}>{ingredient.name}{ingredient.notes ? `, ${ingredient.notes}` : ""}</Text>
                            <Text style={styles.ingredientQuantity}>{ingredient.quantity} {ingredient.unit ?? ""}</Text>
                        </View>
                    ))}

                    <View style={[styles.sectionHeading, styles.methodHeading]}>
                        <Text style={styles.sectionTitle}>The method</Text>
                        <Text style={styles.sectionNote}>{recipe.steps.length} STEPS</Text>
                    </View>
                    {recipe.steps.map((instruction, index) => (
                        <View key={`${index}-${instruction}`} style={styles.stepRow}>
                            <Text style={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</Text>
                            <Text style={styles.stepText}>{instruction}</Text>
                        </View>
                    ))}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { backgroundColor: "#F3F6F0", flex: 1 },
    content: { paddingBottom: 36 },
    hero: { height: 360, justifyContent: "flex-end", overflow: "hidden", position: "relative" },
    heroImage: { backgroundColor: "#D9E1D8", height: "100%", position: "absolute", width: "100%" },
    backButton: { backgroundColor: "#F3F6F0", borderRadius: 6, left: 20, paddingHorizontal: 13, paddingVertical: 10, position: "absolute", top: 18 },
    backText: { color: "#215B43", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
    heroCaption: { backgroundColor: "rgba(18, 39, 29, 0.82)", paddingHorizontal: 23, paddingVertical: 18 },
    heroEyebrow: { color: "#D6BE7A", fontSize: 9, fontWeight: "800", letterSpacing: 1.2, marginBottom: 7 },
    title: { color: "#FFFFFF", fontFamily: "Georgia", fontSize: 30, lineHeight: 36 },
    body: { paddingHorizontal: 22 },
    description: { color: "#5D6B62", fontSize: 15, lineHeight: 23, marginTop: 22 },
    stats: { alignItems: "center", backgroundColor: "#E6ECE4", borderRadius: 7, flexDirection: "row", justifyContent: "space-around", marginTop: 20, paddingVertical: 15 },
    stat: { alignItems: "center", flex: 1 },
    statValue: { color: "#1C4F3A", fontFamily: "Georgia", fontSize: 21 },
    statLabel: { color: "#66766B", fontSize: 8, fontWeight: "800", letterSpacing: 0.9, marginTop: 4 },
    statRule: { backgroundColor: "#C8D3C9", height: 31, width: 1 },
    sectionHeading: { alignItems: "baseline", borderBottomColor: "#D8E0D7", borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", marginTop: 29, paddingBottom: 10 },
    sectionTitle: { color: "#17271F", fontFamily: "Georgia", fontSize: 23 },
    sectionNote: { color: "#A75132", fontSize: 9, fontWeight: "800", letterSpacing: 1 },
    ingredientRow: { alignItems: "center", borderBottomColor: "#E2E8E0", borderBottomWidth: 1, flexDirection: "row", minHeight: 47 },
    ingredientBullet: { backgroundColor: "#D1A74F", borderRadius: 3, height: 6, marginRight: 11, width: 6 },
    ingredientName: { color: "#34453A", flex: 1, fontSize: 13, lineHeight: 19 },
    ingredientQuantity: { color: "#66766B", fontSize: 12, fontWeight: "600", marginLeft: 8 },
    methodHeading: { marginTop: 30 },
    stepRow: { borderBottomColor: "#E2E8E0", borderBottomWidth: 1, flexDirection: "row", gap: 14, paddingVertical: 14 },
    stepNumber: { color: "#A75132", fontFamily: "Georgia", fontSize: 18, width: 28 },
    stepText: { color: "#34453A", flex: 1, fontSize: 13, lineHeight: 20 },
});