package com.smartkitchen.nutrition

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

private val activityLevels = listOf(
    "SEDENTARY" to "Ít vận động",
    "LIGHTLY_ACTIVE" to "Vận động nhẹ",
    "MODERATELY_ACTIVE" to "Vừa phải",
    "ACTIVE" to "Năng động",
    "VERY_ACTIVE" to "Rất năng động",
)

@Composable
fun NutritionProfileScreen(viewModel: NutritionProfileViewModel) {
    val state by viewModel.state.collectAsState()
    var activityMenuExpanded by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Hồ sơ thể chất", style = MaterialTheme.typography.headlineMedium)
        Text("Thông tin của bạn giúp ước tính nhu cầu năng lượng mỗi ngày.")

        if (state.loading) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
        } else {
            OutlinedTextField(
                value = state.height,
                onValueChange = viewModel::updateHeight,
                label = { Text("Chiều cao (cm)") },
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = state.weight,
                onValueChange = viewModel::updateWeight,
                label = { Text("Cân nặng (kg)") },
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = state.age,
                onValueChange = viewModel::updateAge,
                label = { Text("Tuổi") },
                modifier = Modifier.fillMaxWidth(),
            )

            Text("Giới tính", style = MaterialTheme.typography.titleMedium)
            Row(verticalAlignment = Alignment.CenterVertically) {
                RadioButton(selected = state.gender == "FEMALE", onClick = { viewModel.updateGender("FEMALE") })
                Text("Nữ")
                RadioButton(selected = state.gender == "MALE", onClick = { viewModel.updateGender("MALE") })
                Text("Nam")
            }

            Text("Mức độ vận động", style = MaterialTheme.typography.titleMedium)
            Column {
                TextButton(onClick = { activityMenuExpanded = true }) {
                    Text(activityLevels.first { it.first == state.activityLevel }.second)
                }
                DropdownMenu(expanded = activityMenuExpanded, onDismissRequest = { activityMenuExpanded = false }) {
                    activityLevels.forEach { (value, label) ->
                        DropdownMenuItem(
                            text = { Text(label) },
                            onClick = {
                                viewModel.updateActivityLevel(value)
                                activityMenuExpanded = false
                            },
                        )
                    }
                }
            }

            state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(onClick = viewModel::save, enabled = !state.saving, modifier = Modifier.fillMaxWidth()) {
                Text(if (state.saving) "Đang lưu..." else "Lưu và tính toán")
            }
            state.result?.let { result ->
                Text("Nhu cầu calo hàng ngày (TDEE)", style = MaterialTheme.typography.titleMedium)
                Text("${result.tdee} kcal", style = MaterialTheme.typography.headlineMedium)
                Text("BMR ${result.bmr} kcal")
            }
        }
    }
}