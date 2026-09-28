import { Prisma, PrismaClient } from "@prisma/client";
import { CreateRecipeInput, RecipeListQuery, UpdateRecipeInput } from "./recipe.validation";

const recipeInclude = {
    ingredients: { include: { ingredient: true } },
    steps: { orderBy: { position: "asc" } },
    categories: true,
    tags: true,
} satisfies Prisma.RecipeInclude;

const slugify = (value: string): string =>
    value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

const connectOrCreateLabels = (labels: string[]) =>
    labels.map((name) => ({
        where: { name },
        create: { name, slug: slugify(name) },
    }));

export class RecipeService {
    constructor(private readonly prisma: PrismaClient) { }

    async list(query: RecipeListQuery) {
        const where: Prisma.RecipeWhereInput = {
            ...(query.search
                ? { OR: [{ title: { contains: query.search, mode: "insensitive" } }, { description: { contains: query.search, mode: "insensitive" } }] }
                : {}),
            ...(query.difficulty ? { difficulty: query.difficulty } : {}),
            ...(query.category ? { categories: { some: { OR: [{ slug: query.category }, { name: { equals: query.category, mode: "insensitive" } }] } } } : {}),
            ...(query.tag ? { tags: { some: { OR: [{ slug: query.tag }, { name: { equals: query.tag, mode: "insensitive" } }] } } } : {}),
        };
        const skip = (query.page - 1) * query.pageSize;
        const [data, total] = await this.prisma.$transaction([
            this.prisma.recipe.findMany({ where, include: recipeInclude, orderBy: { createdAt: "desc" }, skip, take: query.pageSize }),
            this.prisma.recipe.count({ where }),
        ]);

        return {
            data,
            pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
        };
    }

    getById(id: string) {
        return this.prisma.recipe.findUnique({ where: { id }, include: recipeInclude });
    }

    create(input: CreateRecipeInput) {
        return this.prisma.recipe.create({
            data: {
                title: input.title,
                slug: input.slug ?? slugify(input.title),
                description: input.description,
                prepTimeMinutes: input.prepTimeMinutes,
                cookTimeMinutes: input.cookTimeMinutes,
                servings: input.servings,
                difficulty: input.difficulty,
                coverImageUrl: input.coverImageUrl,
                ingredients: {
                    create: input.ingredients.map(({ name, ...details }) => ({
                        ...details,
                        ingredient: { connectOrCreate: { where: { name }, create: { name } } },
                    })),
                },
                steps: { create: input.steps.map(({ instruction }, index) => ({ instruction, position: index + 1 })) },
                categories: { connectOrCreate: connectOrCreateLabels(input.categories) },
                tags: { connectOrCreate: connectOrCreateLabels(input.tags) },
            },
            include: recipeInclude,
        });
    }

    update(id: string, input: UpdateRecipeInput) {
        const updatedSlug = input.slug ?? (input.title !== undefined ? slugify(input.title) : undefined);
        const data: Prisma.RecipeUpdateInput = {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(updatedSlug !== undefined ? { slug: updatedSlug } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.prepTimeMinutes !== undefined ? { prepTimeMinutes: input.prepTimeMinutes } : {}),
            ...(input.cookTimeMinutes !== undefined ? { cookTimeMinutes: input.cookTimeMinutes } : {}),
            ...(input.servings !== undefined ? { servings: input.servings } : {}),
            ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
            ...(input.coverImageUrl !== undefined ? { coverImageUrl: input.coverImageUrl } : {}),
            ...(input.ingredients !== undefined
                ? {
                    ingredients: {
                        deleteMany: {},
                        create: input.ingredients.map(({ name, ...details }) => ({
                            ...details,
                            ingredient: { connectOrCreate: { where: { name }, create: { name } } },
                        })),
                    },
                }
                : {}),
            ...(input.steps !== undefined
                ? { steps: { deleteMany: {}, create: input.steps.map(({ instruction }, index) => ({ instruction, position: index + 1 })) } }
                : {}),
            ...(input.categories !== undefined
                ? { categories: { set: [], connectOrCreate: connectOrCreateLabels(input.categories) } }
                : {}),
            ...(input.tags !== undefined ? { tags: { set: [], connectOrCreate: connectOrCreateLabels(input.tags) } } : {}),
        };

        return this.prisma.recipe.update({ where: { id }, data, include: recipeInclude });
    }

    async delete(id: string): Promise<void> {
        await this.prisma.recipe.delete({ where: { id } });
    }
}