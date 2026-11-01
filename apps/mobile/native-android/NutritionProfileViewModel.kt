package com.smartkitchen.nutrition

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class NutritionProfileUiState(
    val height: String = "",
    val weight: String = "",
    val age: String = "",
    val gender: String = "FEMALE",
    val activityLevel: String = "SEDENTARY",
    val hasProfile: Boolean = false,
    val loading: Boolean = true,
    val saving: Boolean = false,
    val error: String? = null,
    val result: NutritionProfileResult? = null,
)

class NutritionProfileViewModel(
    private val api: NutritionProfileApi,
    private val userId: String,
) : ViewModel() {
    private val mutableState = MutableStateFlow(NutritionProfileUiState())
    val state: StateFlow<NutritionProfileUiState> = mutableState.asStateFlow()

    init {
        load()
    }

    fun updateHeight(value: String) = mutableState.update { it.copy(height = value, error = null) }
    fun updateWeight(value: String) = mutableState.update { it.copy(weight = value, error = null) }
    fun updateAge(value: String) = mutableState.update { it.copy(age = value, error = null) }
    fun updateGender(value: String) = mutableState.update { it.copy(gender = value, error = null) }
    fun updateActivityLevel(value: String) = mutableState.update { it.copy(activityLevel = value, error = null) }

    fun load() = viewModelScope.launch {
        mutableState.update { it.copy(loading = true, error = null) }
        try {
            val response = api.getProfile(userId)
            if (response.isSuccessful) {
                val result = response.body() ?: error("Empty profile response")
                mutableState.update {
                    it.copy(
                        height = result.profile.height.toString(),
                        weight = result.profile.weight.toString(),
                        age = result.profile.age.toString(),
                        gender = result.profile.gender,
                        activityLevel = result.profile.activityLevel,
                        hasProfile = true,
                        result = result,
                    )
                }
            } else if (response.code() != 404) {
                mutableState.update { it.copy(error = "Không thể tải hồ sơ dinh dưỡng.") }
            }
        } catch (_: Exception) {
            mutableState.update { it.copy(error = "Không thể kết nối đến dịch vụ dinh dưỡng.") }
        } finally {
            mutableState.update { it.copy(loading = false) }
        }
    }

    fun save() = viewModelScope.launch {
        val current = state.value
        val profile = NutritionProfileInput(
            height = current.height.toDoubleOrNull() ?: return@launch invalidInput(),
            weight = current.weight.toDoubleOrNull() ?: return@launch invalidInput(),
            age = current.age.toIntOrNull() ?: return@launch invalidInput(),
            gender = current.gender,
            activityLevel = current.activityLevel,
        )
        if (profile.height <= 0 || profile.weight <= 0 || profile.age <= 0) return@launch invalidInput()

        mutableState.update { it.copy(saving = true, error = null) }
        try {
            val response = if (current.hasProfile) api.updateProfile(userId, profile) else api.createProfile(userId, profile)
            if (response.isSuccessful) {
                mutableState.update { it.copy(hasProfile = true, result = response.body(), error = null) }
            } else {
                mutableState.update { it.copy(error = "Không thể lưu hồ sơ (${response.code()}).") }
            }
        } catch (_: Exception) {
            mutableState.update { it.copy(error = "Không thể kết nối đến dịch vụ dinh dưỡng.") }
        } finally {
            mutableState.update { it.copy(saving = false) }
        }
    }

    private fun invalidInput() = mutableState.update {
        it.copy(error = "Chiều cao, cân nặng và tuổi phải là số dương hợp lệ.")
    }
}