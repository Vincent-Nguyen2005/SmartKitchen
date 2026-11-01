package com.smartkitchen.nutrition

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.PUT

data class NutritionProfileInput(
    val height: Double,
    val weight: Double,
    val age: Int,
    val gender: String,
    val activityLevel: String,
)

data class NutritionProfile(
    val id: String,
    val userId: String,
    val height: Double,
    val weight: Double,
    val age: Int,
    val gender: String,
    val activityLevel: String,
    val createdAt: String,
    val updatedAt: String,
)

data class NutritionProfileResult(
    val profile: NutritionProfile,
    val bmr: Int,
    val tdee: Int,
)

interface NutritionProfileApi {
    @GET("api/nutrition-profile")
    suspend fun getProfile(@Header("X-User-Id") userId: String): Response<NutritionProfileResult>

    @POST("api/nutrition-profile")
    suspend fun createProfile(
        @Header("X-User-Id") userId: String,
        @Body profile: NutritionProfileInput,
    ): Response<NutritionProfileResult>

    @PUT("api/nutrition-profile")
    suspend fun updateProfile(
        @Header("X-User-Id") userId: String,
        @Body profile: NutritionProfileInput,
    ): Response<NutritionProfileResult>
}