import React, { useMemo, useState } from "react";
import {
    FlatList,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Recipe } from "./types";

const sampleRecipes: Recipe[] = [
    {
        id: "lemon-chicken",
        title: "Lemon herb roast chicken",
        description: "Crisp edges, juicy chicken, and a bright pan sauce.",
        imageUrl: "https://images.unsplash.com/photo-1532550907401-a500c9a57435?w=900&q=85",
        categories: ["Dinner", "High protein"],
        prepTimeMinutes: 15,
        cookTimeMinutes: 55,
        servings: 4,
        difficulty: "EASY",
        ingredients: [{ name: "Chicken thighs", quantity: "800", unit: "g" }, { name: "Lemon", quantity: "1" }],
        steps: ["Heat the oven to 200 C.", "Season the chicken with lemon and herbs.", "Roast until golden and cooked through."],
    },
    {
        id: "tomato-pasta",
        title: "Tomato basil pasta",
        description: "Sweet tomatoes, torn basil, and a shower of Parmesan.",
        imageUrl: "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=900&q=85",
        categories: ["Dinner", "Vegetarian"],
        prepTimeMinutes: 10,
        cookTimeMinutes: 20,
        servings: 2,
        difficulty: "EASY",
        ingredients: [{ name: "Pasta", quantity: "200", unit: "g" }, { name: "Cherry tomatoes", quantity: "250", unit: "g" }],
        steps: ["Cook the pasta in salted water.", "Warm tomatoes until they begin to burst.", "Toss together with basil and Parmesan."],
    },
    {
        id: "garden-omelette",
        title: "Green garden omelette",
        description: "Soft folded eggs with spinach, chives, and cheddar.",
        imageUrl: "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=900&q=85",
        categories: ["Breakfast", "Vegetarian"],
        prepTimeMinutes: 8,
        cookTimeMinutes: 8,
        servings: 1,
        difficulty: "EASY",
        ingredients: [{ name: "Eggs", quantity: "2" }, { name: "Baby spinach", quantity: "1", unit: "cup" }],
        steps: ["Whisk eggs with salt and pepper.", "Wilt the spinach in a warm pan.", "Add eggs, fold gently, and serve."],
    },
];

const categories = ["All", "Dinner", "Breakfast", "Vegetarian", "High protein"];

type Props = {
    recipes?: Recipe[];
    onRecipePress?: (recipe: Recipe) => void;
};

export default function RecipeListScreen({ recipes = sampleRecipes, onRecipePress }: Props): React.JSX.Element {
    const [search, setSearch] = useState("");
    const [activeCategory, setActiveCategory] = useState("All");
    const filteredRecipes = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase();
        return recipes.filter((recipe) => {
            const matchesSearch = !normalizedSearch || `${recipe.title} ${recipe.description}`.toLowerCase().includes(normalizedSearch);
            const matchesCategory = activeCategory === "All" || recipe.categories.includes(activeCategory);
            return matchesSearch && matchesCategory;
        });
    }, [activeCategory, recipes, search]);

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <Text style={styles.eyebrow}>SMARTKITCHEN / RECIPES</Text>
                <Text style={styles.title}>What sounds good?</Text>
                <Text style={styles.subtitle}>A little inspiration for whatever is in your kitchen.</Text>
                <View style={styles.searchBox}>
                    <Text style={styles.searchMark}>Search</Text>
                    <TextInput
                        accessibilityLabel="Search recipes"
                        onChangeText={setSearch}
                        placeholder="Try pasta, chicken, breakfast..."
                        placeholderTextColor="#77847C"
                        returnKeyType="search"
                        style={styles.searchInput}
                        value={search}
                    />
                    {search.length > 0 && (
                        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch("")} style={styles.clearButton}>
                            <Text style={styles.clearText}>Clear</Text>
                        </Pressable>
                    )}
                </View>
            </View>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoryScroller}
                contentContainerStyle={styles.categoryRail}
            >
                {categories.map((category) => {
                    const active = category === activeCategory;
                    return (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            key={category}
                            onPress={() => setActiveCategory(category)}
                            style={[styles.categoryButton, active && styles.categoryButtonActive]}
                        >
                            <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{category}</Text>
                        </Pressable>
                    );
                })}
            </ScrollView>

            <FlatList
                contentContainerStyle={styles.listContent}
                data={filteredRecipes}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={<Text style={styles.emptyText}>No recipes found. Try another search or category.</Text>}
                ListHeaderComponent={<Text style={styles.resultCount}>{filteredRecipes.length} RECIPES TO EXPLORE</Text>}
                renderItem={({ item, index }) => (
                    <Pressable accessibilityRole="button" onPress={() => onRecipePress?.(item)} style={styles.recipeRow}>
                        <View style={styles.imageWrap}>
                            <Image source={{ uri: item.imageUrl }} style={styles.recipeImage} />
                            <Text style={[styles.indexMark, index % 2 === 0 ? styles.indexWarm : styles.indexCool]}>
                                {String(index + 1).padStart(2, "0")}
                            </Text>
                        </View>
                        <View style={styles.recipeInfo}>
                            <Text style={styles.recipeCategory}>{item.categories[0]?.toUpperCase() ?? "RECIPE"}</Text>
                            <Text style={styles.recipeTitle}>{item.title}</Text>
                            <Text numberOfLines={2} style={styles.recipeDescription}>{item.description}</Text>
                            <View style={styles.recipeMeta}>
                                <Text style={styles.metaText}>{item.prepTimeMinutes + item.cookTimeMinutes} min</Text>
                                <View style={styles.metaDot} />
                                <Text style={styles.metaText}>{item.servings} servings</Text>
                                <Text style={styles.openMark}>OPEN  +</Text>
                            </View>
                        </View>
                    </Pressable>
                )}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { backgroundColor: "#F3F6F0", flex: 1 },
    header: { paddingHorizontal: 22, paddingTop: 18 },
    eyebrow: { color: "#547364", fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
    title: { color: "#17271F", fontFamily: "Georgia", fontSize: 32, marginTop: 14 },
    subtitle: { color: "#64736A", fontSize: 14, lineHeight: 20, marginTop: 6 },
    searchBox: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#DDE5DC", borderRadius: 8, borderWidth: 1, flexDirection: "row", marginTop: 20, minHeight: 52, paddingHorizontal: 13 },
    searchMark: { color: "#A75132", fontSize: 11, fontWeight: "800", marginRight: 10, textTransform: "uppercase" },
    searchInput: { color: "#17271F", flex: 1, fontSize: 14, paddingVertical: 12 },
    clearButton: { padding: 8 },
    clearText: { color: "#27634B", fontSize: 12, fontWeight: "700" },
    categoryScroller: { flexGrow: 0, flexShrink: 0, height: 72 },
    categoryRail: { alignItems: "center", gap: 8, paddingHorizontal: 22 },
    categoryButton: { alignItems: "center", backgroundColor: "#E5EBE3", borderRadius: 24, flexGrow: 0, flexShrink: 0, height: 48, justifyContent: "center", minWidth: 64, paddingHorizontal: 18 },
    categoryButtonActive: { backgroundColor: "#215B43" },
    categoryText: { color: "#4A5E51", fontSize: 13, fontWeight: "600" },
    categoryTextActive: { color: "#FFFFFF" },
    listContent: { paddingBottom: 28, paddingHorizontal: 22 },
    resultCount: { color: "#79857C", fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 4 },
    recipeRow: { borderBottomColor: "#DDE5DC", borderBottomWidth: 1, flexDirection: "row", gap: 14, paddingVertical: 15 },
    imageWrap: { height: 126, position: "relative", width: 112 },
    recipeImage: { backgroundColor: "#D9E1D8", borderRadius: 6, height: "100%", width: "100%" },
    indexMark: { alignItems: "center", borderRadius: 4, bottom: 7, color: "#17271F", fontSize: 10, fontWeight: "800", overflow: "hidden", paddingHorizontal: 7, paddingVertical: 5, position: "absolute", right: 7 },
    indexWarm: { backgroundColor: "#F3C875" },
    indexCool: { backgroundColor: "#B7D5C2" },
    recipeInfo: { flex: 1, justifyContent: "center", minWidth: 0, paddingVertical: 2 },
    recipeCategory: { color: "#A75132", fontSize: 9, fontWeight: "800", letterSpacing: 1.1, marginBottom: 5 },
    recipeTitle: { color: "#17271F", fontFamily: "Georgia", fontSize: 19, lineHeight: 23 },
    recipeDescription: { color: "#67746B", fontSize: 12, lineHeight: 17, marginTop: 5 },
    recipeMeta: { alignItems: "center", flexDirection: "row", marginTop: 11 },
    metaText: { color: "#59685E", fontSize: 10, fontWeight: "600" },
    metaDot: { backgroundColor: "#C2CDC3", borderRadius: 3, height: 4, marginHorizontal: 7, width: 4 },
    openMark: { color: "#215B43", fontSize: 9, fontWeight: "800", marginLeft: "auto" },
    emptyText: { color: "#64736A", fontSize: 14, lineHeight: 21, paddingVertical: 28 },
});