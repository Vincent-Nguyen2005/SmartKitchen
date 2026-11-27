import { seedRecipes, type SeedRecipe } from "./recipes.data";

/** One step: instruction, timer in seconds (null = no timer), names of the dish's ingredients added now. */
type StepRow = [instruction: string, seconds: number | null, ingredients: string[]];

/**
 * Home-cooking steps for the starter dishes (keyed by dish name). Ingredient names must match the dish's
 * ingredient list in recipes.data.ts; quantities and units are taken from there.
 */
const STEPS: Record<string, StepRow[]> = {
  "Phở bò": [
    ["Chần xương bò 5 phút, rửa sạch", 300, ["Xương bò"]],
    ["Ninh xương lửa nhỏ, hớt bọt", 7200, []],
    ["Nướng thơm hành tây và gừng, cho vào nồi cùng hoa hồi, quế, ninh thêm", 3600, ["Hành tây", "Gừng"]],
    ["Nêm nước dùng vừa ăn", 120, []],
    ["Thái thịt bò thật mỏng; trụng bánh phở qua nước sôi rồi cho ra tô", 30, ["Thịt bò", "Bánh phở"]],
    ["Xếp thịt bò lên bánh, chan nước dùng đang sôi, rắc hành lá", null, ["Hành lá"]],
  ],
  "Bánh mì trứng ốp la": [
    ["Rửa sạch, thái lát dưa leo và cà chua", null, ["Dưa leo", "Cà chua"]],
    ["Làm nóng chảo với chút dầu", 60, []],
    ["Đập trứng vào chảo, chiên lửa vừa đến khi lòng trắng chín", 180, ["Trứng gà"]],
    ["Nướng giòn bánh mì", 120, ["Bánh mì"]],
    ["Kẹp trứng cùng dưa leo, cà chua vào bánh mì", null, []],
  ],
  "Xôi đậu xanh": [
    ["Ngâm gạo nếp và đậu xanh trong nước", 3600, ["Gạo nếp", "Đậu xanh"]],
    ["Để ráo, trộn gạo nếp với đậu xanh và chút muối", null, []],
    ["Hấp xôi đến khi hạt nếp chín dẻo", 1800, []],
    ["Phi hành tím với dầu đến khi vàng giòn", 120, ["Hành tím"]],
    ["Xới xôi ra đĩa, rắc hành phi, ăn kèm đường tùy thích", null, []],
  ],
  "Cháo gà": [
    ["Vo sạch gạo, rang sơ cho thơm", 180, ["Gạo"]],
    ["Luộc thịt gà với gừng đến khi chín", 1200, ["Thịt gà", "Gừng"]],
    ["Vớt gà ra xé nhỏ, cho gạo vào nước luộc gà nấu cháo", 1800, []],
    ["Cho thịt gà xé vào cháo, nêm vừa ăn", 120, []],
    ["Múc ra tô, rắc hành lá", null, ["Hành lá"]],
  ],
  "Cháo yến mạch chuối sữa": [
    ["Cho yến mạch và sữa tươi vào nồi", null, ["Yến mạch", "Sữa tươi"]],
    ["Nấu lửa nhỏ, khuấy đều đến khi sánh", 300, []],
    ["Cắt lát chuối", null, ["Chuối"]],
    ["Múc cháo ra bát, xếp chuối lên trên", null, []],
  ],
  "Bún riêu cua": [
    ["Giã hoặc xay cua với chút muối, lọc lấy nước, để riêng phần gạch", null, ["Cua đồng"]],
    ["Đun nước cua lửa nhỏ đến khi riêu nổi lên", 900, []],
    ["Phi thơm rồi xào cà chua cho mềm", 180, ["Cà chua"]],
    ["Cắt đậu phụ, chiên vàng", 480, ["Đậu phụ"]],
    ["Cho cà chua, đậu phụ chiên và trứng đánh tan vào nồi, nêm vừa ăn", 300, ["Trứng gà"]],
    ["Trụng bún, cho ra tô và chan nước riêu", null, ["Bún"]],
  ],
  "Hủ tiếu Nam Vang": [
    ["Chần xương heo 5 phút, rửa sạch", 300, ["Xương heo"]],
    ["Ninh xương lấy nước dùng, hớt bọt", 5400, []],
    ["Nêm nước dùng vừa ăn", 120, []],
    ["Luộc thịt heo trong nồi nước dùng", 900, ["Thịt heo"]],
    ["Vớt thịt ra thái lát, cho tôm vào luộc chín", 180, ["Tôm"]],
    ["Trụng hủ tiếu và giá đỗ, xếp ra tô cùng thịt, tôm, chan nước dùng, rắc tỏi phi", 30, ["Hủ tiếu", "Giá đỗ"]],
  ],
  "Bún bò Huế": [
    ["Đập dập sả, cho vào nồi nước cùng giò heo", null, ["Sả", "Giò heo"]],
    ["Ninh giò heo đến khi mềm", 3600, []],
    ["Hòa mắm ruốc với nước, lọc lấy nước cho vào nồi, nêm vừa ăn", 300, []],
    ["Cho thịt bò vào luộc chín rồi vớt ra thái lát", 900, ["Thịt bò"]],
    ["Trụng bún, cho ra tô", 30, ["Bún"]],
    ["Xếp thịt bò, giò heo lên bún và chan nước dùng", null, []],
  ],
  "Bò kho": [
    ["Cắt thịt bò miếng vừa ăn, ướp với sả, tỏi, hành tím băm, ngũ vị hương, nước mắm, đường", 900, ["Thịt bò", "Sả", "Tỏi", "Hành tím"]],
    ["Phi dầu điều, xào săn thịt bò", 300, []],
    ["Đổ nước ngập thịt, hầm lửa nhỏ", 3600, []],
    ["Cho cà rốt vào hầm đến khi mềm", 900, ["Cà rốt"]],
    ["Múc ra bát, ăn kèm bánh mì", null, ["Bánh mì"]],
  ],
  "Thịt kho trứng": [
    ["Luộc trứng, bóc vỏ", 600, ["Trứng gà"]],
    ["Cắt thịt ba chỉ miếng vuông, ướp gia vị", 900, ["Thịt ba chỉ"]],
    ["Thắng đường lấy màu rồi cho thịt vào đảo săn", 300, []],
    ["Đổ nước dừa, cho trứng vào, kho lửa nhỏ", 2700, ["Nước dừa"]],
  ],
  "Cá kho tộ": [
    ["Làm sạch cá, cắt khúc", null, ["Cá basa"]],
    ["Ướp cá với hành tím, ớt và gia vị", 900, ["Hành tím", "Ớt"]],
    ["Kho cá lửa vừa, trở mặt một lần", 1200, []],
    ["Hạ lửa nhỏ kho đến khi nước sánh lại", 600, []],
  ],
  "Canh chua cá": [
    ["Làm sạch cá, cắt khúc, ướp chút muối và nước mắm", 600, ["Cá basa"]],
    ["Đun sôi nồi nước", 300, []],
    ["Cho dứa và cà chua vào nấu", 180, ["Dứa", "Cà chua"]],
    ["Cho cá vào nấu chín", 420, []],
    ["Thêm đậu bắp và giá đỗ, nêm chua ngọt", 120, ["Đậu bắp", "Giá đỗ"]],
    ["Rắc rau thơm (ngò gai, rau om) rồi tắt bếp", null, ["Rau thơm"]],
  ],
  "Rau muống xào tỏi": [
    ["Nhặt, rửa sạch rau muống, để ráo", null, ["Rau muống"]],
    ["Phi thơm tỏi", 60, ["Tỏi"]],
    ["Cho rau muống vào xào lửa lớn", 120, []],
    ["Nêm vừa ăn rồi tắt bếp", null, []],
  ],
  "Canh bí đỏ thịt bằm": [
    ["Xào sơ thịt heo xay", 120, ["Thịt heo xay"]],
    ["Đổ nước vào, đun sôi", 300, []],
    ["Cho bí đỏ vào nấu đến khi mềm", 600, ["Bí đỏ"]],
    ["Nêm vừa ăn, rắc hành lá", null, ["Hành lá"]],
  ],
  "Gà kho gừng": [
    ["Chặt gà miếng vừa ăn, ướp với hành tím, nước mắm, đường, tiêu", 900, ["Thịt gà", "Hành tím"]],
    ["Phi thơm gừng thái sợi", 60, ["Gừng"]],
    ["Cho gà vào xào săn", 300, []],
    ["Thêm chút nước, kho lửa nhỏ đến khi gà thấm", 1200, []],
  ],
  "Đậu phụ sốt cà chua": [
    ["Cắt đậu phụ miếng vuông, chiên vàng các mặt", 480, ["Đậu phụ"]],
    ["Xào cà chua đến khi nhuyễn thành sốt", 240, ["Cà chua"]],
    ["Cho đậu phụ vào sốt, đun liu riu", 300, []],
    ["Rắc hành lá rồi tắt bếp", null, ["Hành lá"]],
  ],
  "Trứng xào cà chua": [
    ["Đánh tan trứng với chút nước mắm", null, ["Trứng gà"]],
    ["Xào cà chua cho mềm", 180, ["Cà chua"]],
    ["Đổ trứng vào, đảo nhẹ đến khi trứng vừa chín", 120, []],
    ["Rắc hành lá rồi tắt bếp", null, ["Hành lá"]],
  ],
  "Bò xào bông cải xanh": [
    ["Thái mỏng thịt bò, ướp gia vị", 600, ["Thịt bò"]],
    ["Chần bông cải xanh và cà rốt", 120, ["Bông cải xanh", "Cà rốt"]],
    ["Phi thơm tỏi", 60, ["Tỏi"]],
    ["Cho thịt bò vào xào lửa lớn", 120, []],
    ["Cho rau vào đảo đều, nêm vừa ăn", 120, []],
  ],
  "Canh rau ngót thịt bằm": [
    ["Vò nhẹ rau ngót cho mềm", null, ["Rau ngót"]],
    ["Xào sơ thịt heo xay rồi đổ nước, đun sôi", 300, ["Thịt heo xay"]],
    ["Cho rau ngót vào nấu", 180, []],
    ["Nêm vừa ăn rồi tắt bếp", null, []],
  ],
  "Sườn xào chua ngọt": [
    ["Chặt sườn miếng nhỏ, chần qua nước sôi", 180, ["Sườn heo"]],
    ["Chiên sườn vàng các mặt", 600, []],
    ["Phi tỏi, xào hành tây, cà chua và dứa, thêm tương cà", 180, ["Hành tây", "Cà chua", "Dứa"]],
    ["Cho sườn vào, rim lửa nhỏ đến khi sốt sánh", 900, []],
  ],
  "Tôm rim": [
    ["Rửa sạch tôm, cắt râu", null, ["Tôm"]],
    ["Phi thơm tỏi", 60, ["Tỏi"]],
    ["Cho tôm vào rim cùng nước mắm, đường lửa vừa đến khi sánh", 480, []],
    ["Rắc hành lá rồi tắt bếp", null, ["Hành lá"]],
  ],
  "Cơm chiên dương châu": [
    ["Nấu cơm từ trước, để nguội cho hạt rời", null, ["Gạo"]],
    ["Thái hạt lựu lạp xưởng và cà rốt", null, ["Lạp xưởng", "Cà rốt"]],
    ["Xào lạp xưởng, cà rốt và đậu Hà Lan", 180, ["Đậu Hà Lan"]],
    ["Cho trứng vào đảo nhanh", 60, ["Trứng gà"]],
    ["Cho cơm vào chiên lửa lớn, đảo đều", 300, []],
  ],
  "Bún chả": [
    ["Ướp thịt heo xay và thịt ba chỉ thái lát", 1800, ["Thịt heo xay", "Thịt ba chỉ"]],
    ["Viên chả, nướng thịt đến khi vàng thơm", 900, []],
    ["Pha nước mắm chua ngọt, thả chả vào", null, []],
    ["Rửa sạch xà lách và rau thơm, để ráo; bày bún và rau ra đĩa", null, ["Bún", "Xà lách", "Rau thơm"]],
  ],
  "Gỏi cuốn tôm thịt": [
    ["Luộc thịt ba chỉ đến khi chín", 1200, ["Thịt ba chỉ"]],
    ["Luộc tôm, bóc vỏ, chẻ đôi", 180, ["Tôm"]],
    ["Thái mỏng thịt, chuẩn bị bún, xà lách và rau thơm", null, ["Bún", "Xà lách", "Rau thơm"]],
    ["Nhúng bánh tráng, cuốn tôm, thịt, bún, xà lách và rau thơm", null, ["Bánh tráng"]],
  ],
  "Mực xào cần tây": [
    ["Làm sạch mực, khứa vảy rồng, cắt miếng", null, ["Mực"]],
    ["Phi hành tây cho thơm", 60, ["Hành tây"]],
    ["Cho mực vào xào lửa lớn", 120, []],
    ["Thêm cần tây, đảo nhanh rồi tắt bếp", 60, ["Cần tây"]],
  ],
  "Xôi gà": [
    ["Ngâm gạo nếp trong nước", 3600, ["Gạo nếp"]],
    ["Luộc thịt gà đến khi chín, vớt ra xé nhỏ", 1200, ["Thịt gà"]],
    ["Hấp xôi đến khi hạt nếp chín dẻo", 1800, []],
    ["Phi hành tím vàng giòn", 120, ["Hành tím"]],
    ["Xới xôi ra đĩa, xếp gà xé và hành phi lên trên", null, []],
  ],
  "Cháo thịt bằm": [
    ["Vo sạch gạo, cho vào nồi nước nấu nhừ", 2400, ["Gạo"]],
    ["Ướp thịt heo xay với chút gia vị", 300, ["Thịt heo xay"]],
    ["Cho thịt vào cháo, khuấy tơi cho chín", 300, []],
    ["Nêm vừa ăn, rắc hành lá", null, ["Hành lá"]],
  ],
  "Bánh mì chảo": [
    ["Làm nóng chảo gang với chút dầu", 60, []],
    ["Áp chảo xúc xích cho vàng", 180, ["Xúc xích"]],
    ["Đập trứng vào chảo, thêm pa tê bên cạnh", 180, ["Trứng gà", "Pa tê"]],
    ["Nướng giòn bánh mì, ăn kèm khi còn nóng", 120, ["Bánh mì"]],
  ],
  "Mì xào trứng": [
    ["Trụng mì qua nước sôi cho tơi, để ráo", 120, ["Mì gói"]],
    ["Xào chín cải ngọt", 120, ["Cải ngọt"]],
    ["Cho mì vào xào cùng gói gia vị", 120, []],
    ["Đập trứng vào đảo đều đến khi trứng chín", 90, ["Trứng gà"]],
  ],
  "Sữa đậu nành": [
    ["Ngâm đậu nành qua đêm cho nở", null, ["Đậu nành"]],
    ["Xay đậu nành với nước, lọc lấy nước sữa", null, []],
    ["Đun sữa lửa vừa, khuấy đều; khi sôi hạ lửa đun thêm 10 phút, hớt bọt", 1500, []],
    ["Để nguội bớt, thêm đường tùy thích", null, []],
  ],
  "Nước cam": [
    ["Cắt đôi cam", null, ["Cam"]],
    ["Vắt lấy nước, lọc bỏ hạt, thêm đá", null, []],
  ],
  "Sinh tố chuối": [
    ["Bóc vỏ chuối, cắt khúc", null, ["Chuối"]],
    ["Xay chuối với sữa tươi và đá đến khi mịn", 60, ["Sữa tươi"]],
  ],
  "Cá chiên giòn": [
    ["Làm sạch cá, cắt miếng, thấm khô", null, ["Cá basa"]],
    ["Lăn cá qua bột chiên giòn", null, ["Bột chiên giòn"]],
    ["Chiên cá mặt thứ nhất đến khi vàng", 300, []],
    ["Lật mặt, chiên tiếp đến khi giòn", 300, []],
  ],
  "Thịt ba chỉ luộc": [
    ["Rửa sạch thịt ba chỉ", null, ["Thịt ba chỉ"]],
    ["Luộc thịt với gừng đập dập", 1500, ["Gừng"]],
    ["Ngâm thịt vào nước lạnh cho săn", 120, []],
    ["Thái lát mỏng, pha nước mắm tỏi ớt để chấm", null, []],
  ],
  "Đậu hũ nhồi thịt": [
    ["Rạch đậu phụ, nhồi thịt heo xay đã ướp", null, ["Đậu phụ", "Thịt heo xay"]],
    ["Chiên đậu nhồi thịt vàng các mặt", 480, []],
    ["Xào cà chua thành sốt", 240, ["Cà chua"]],
    ["Cho đậu vào sốt, đun liu riu cho thấm", 480, []],
  ],
  "Đậu cô ve xào thịt bò": [
    ["Thái mỏng thịt bò, ướp gia vị", 600, ["Thịt bò"]],
    ["Chần đậu que (đậu cô ve)", 120, ["Đậu que"]],
    ["Phi thơm tỏi, xào thịt bò lửa lớn", 120, ["Tỏi"]],
    ["Cho đậu que vào đảo đều, nêm vừa ăn", 180, []],
  ],
  "Cải thìa xào nấm": [
    ["Rửa sạch cải thìa và nấm hương", null, ["Cải thìa", "Nấm hương"]],
    ["Phi thơm tỏi", 60, ["Tỏi"]],
    ["Xào nấm hương cho thơm", 120, []],
    ["Cho cải thìa vào xào chín tới", 120, []],
  ],
  "Canh cải thịt bằm": [
    ["Xào sơ thịt heo xay", 120, ["Thịt heo xay"]],
    ["Đổ nước vào, đun sôi", 300, []],
    ["Cho cải xanh vào nấu", 180, ["Cải xanh"]],
    ["Nêm vừa ăn rồi tắt bếp", null, []],
  ],
  "Canh trứng cà chua": [
    ["Phi dầu, xào cà chua cho mềm", 120, ["Cà chua"]],
    ["Đổ nước vào, đun sôi", 300, []],
    ["Đổ trứng đánh tan vào, khuấy nhẹ", 60, ["Trứng gà"]],
    ["Nêm vừa ăn, rắc hành lá", null, ["Hành lá"]],
  ],
  "Rau muống luộc": [
    ["Nhặt, rửa sạch rau muống", null, ["Rau muống"]],
    ["Đun sôi nước với chút muối", 300, []],
    ["Cho rau vào luộc chín tới", 120, []],
    ["Vớt ra, giữ nước luộc làm canh", null, []],
  ],
  "Bắp cải luộc": [
    ["Tách lá bắp cải, rửa sạch", null, ["Bắp cải"]],
    ["Đun sôi nước", 300, []],
    ["Luộc bắp cải đến khi mềm", 300, []],
    ["Vớt ra đĩa, chấm nước mắm", null, []],
  ],
  "Đậu bắp luộc": [
    ["Rửa sạch đậu bắp, cắt cuống", null, ["Đậu bắp"]],
    ["Đun sôi nước", 300, []],
    ["Luộc đậu bắp vừa chín", 180, []],
    ["Vớt ra, chấm nước mắm hoặc kho quẹt", null, []],
  ],
  "Chuối tráng miệng": [
    ["Chọn chuối chín, rửa sạch", null, ["Chuối"]],
    ["Bày ra đĩa ăn sau bữa", null, []],
  ],
  "Dưa hấu": [
    ["Rửa sạch, cắt dưa hấu thành miếng", null, ["Dưa hấu"]],
    ["Để lạnh trước khi ăn", 900, []],
  ],
  "Chè đậu xanh": [
    ["Ngâm đậu xanh cho nở", 1800, ["Đậu xanh"]],
    ["Nấu đậu xanh với nước đến khi nhừ", 1200, []],
    ["Thêm đường, khuấy tan", 120, []],
    ["Chan nước cốt dừa khi ăn", null, ["Nước cốt dừa"]],
  ],
  "Sữa chua": [
    ["Lấy sữa chua từ tủ lạnh", null, ["Sữa chua"]],
    ["Ăn lạnh sau bữa", null, []],
  ],
  "Cam tráng miệng": [
    ["Rửa sạch, bổ cam thành múi", null, ["Cam"]],
    ["Bày ra đĩa ăn sau bữa", null, []],
  ],
  "Canh khổ qua nhồi thịt": [
    ["Ngâm nấm mèo, băm nhỏ, trộn với thịt heo xay", 900, ["Nấm mèo", "Thịt heo xay"]],
    ["Bổ khổ qua, bỏ ruột, nhồi nhân thịt", null, ["Khổ qua"]],
    ["Đun sôi nước, thả khổ qua vào", 300, []],
    ["Hạ lửa nấu đến khi khổ qua mềm", 1200, []],
  ],
  "Su su luộc": [
    ["Gọt vỏ su su, cắt múi cau", null, ["Su su"]],
    ["Đun sôi nước với chút muối", 300, []],
    ["Luộc su su đến khi mềm", 300, []],
    ["Vớt ra đĩa, chấm muối mè hoặc nước mắm", null, []],
  ],
  "Cải ngọt luộc": [
    ["Nhặt, rửa sạch cải ngọt, cắt khúc", null, ["Cải ngọt"]],
    ["Đun sôi nước với chút muối", 300, []],
    ["Luộc cải chín tới", 120, []],
    ["Vớt ra, chấm nước mắm", null, []],
  ],
  "Rau lang luộc": [
    ["Nhặt lấy ngọn rau lang, rửa sạch", null, ["Rau lang"]],
    ["Đun sôi nước với chút muối", 300, []],
    ["Luộc rau lang chín tới", 120, []],
    ["Vớt ra, chấm nước mắm tỏi", null, []],
  ],
  "Bông cải xanh luộc": [
    ["Cắt bông cải xanh thành nhánh nhỏ, ngâm nước muối, rửa sạch", 300, ["Bông cải xanh"]],
    ["Đun sôi nước với chút muối", 300, []],
    ["Luộc bông cải vừa chín, còn giòn xanh", 180, []],
    ["Vớt ra, chấm nước mắm", null, []],
  ],
  "Đậu que luộc": [
    ["Tước xơ, rửa sạch đậu que, cắt khúc", null, ["Đậu que"]],
    ["Đun sôi nước với chút muối", 300, []],
    ["Luộc đậu que chín tới", 240, []],
    ["Vớt ra, chấm nước mắm", null, []],
  ],
  "Dưa leo chấm muối": [
    ["Rửa sạch dưa leo", null, ["Dưa leo"]],
    ["Ngâm dưa leo trong nước muối loãng", 300, []],
    ["Cắt khúc hoặc chẻ dọc dưa leo", null, []],
    ["Pha muối với ớt và vắt chút chanh để chấm", null, []],
  ],
  "Sữa tươi nóng": [
    ["Đun sữa tươi lửa nhỏ đến khi nóng, không để sôi trào", 240, ["Sữa tươi"]],
    ["Rót ra cốc, uống khi còn ấm", null, []],
  ],
  "Nước chanh": [
    ["Vắt chanh, lọc bỏ hạt", null, ["Chanh"]],
    ["Pha nước cốt chanh với nước và đường, khuấy tan, thêm đá", null, []],
  ],
  "Trà xanh nóng": [
    ["Tráng ấm bằng nước sôi", null, []],
    ["Cho trà vào ấm, rót nước khoảng 80-90 độ, hãm", 180, ["Trà xanh"]],
    ["Rót trà ra chén", null, []],
  ],
  "Sinh tố bơ": [
    ["Bổ đôi quả bơ, bỏ hạt, nạo lấy thịt", null, ["Quả bơ"]],
    ["Xay bơ với sữa tươi, sữa đặc và đá đến khi mịn", 60, ["Sữa tươi", "Sữa đặc"]],
  ],
  "Nước ép dưa hấu": [
    ["Bỏ vỏ, cắt miếng, bỏ hạt dưa hấu", null, ["Dưa hấu"]],
    ["Ép hoặc xay dưa hấu, lọc lấy nước, thêm đá", 60, []],
  ],
  "Bánh canh cua": [
    ["Chần xương heo 5 phút, rửa sạch", 300, ["Xương heo"]],
    ["Ninh xương lấy nước dùng, hớt bọt", 5400, []],
    ["Luộc tôm, bóc vỏ", 180, ["Tôm"]],
    ["Phi hành tím với dầu điều, xào thịt cua cho thơm", 180, ["Hành tím", "Thịt cua"]],
    ["Cho cua, tôm vào nồi nước dùng, nêm vừa ăn", 300, []],
    ["Trụng bánh canh, cho ra tô, chan nước dùng, rắc hành lá", 60, ["Bánh canh", "Hành lá"]],
  ],
  "Mì Quảng": [
    ["Thái thịt heo miếng vừa ăn, ướp với hành tím băm và nước mắm", 900, ["Thịt heo", "Hành tím"]],
    ["Phi dầu điều, xào thịt heo săn lại", 300, []],
    ["Cho tôm vào, thêm ít nước, nấu lửa nhỏ đến khi thịt chín mềm, nêm vừa ăn", 600, ["Tôm"]],
    ["Rang lạc vàng, giã dập", 300, ["Lạc"]],
    ["Trụng mì Quảng và giá đỗ, cho ra tô cùng xà lách và rau thơm", 30, ["Mì Quảng", "Giá đỗ", "Xà lách", "Rau thơm"]],
    ["Chan ít nước nhân, rắc lạc rang", null, []],
  ],
  "Bánh cuốn": [
    ["Ngâm nấm mèo cho nở, băm nhỏ", 900, ["Nấm mèo"]],
    ["Phi hành tím, xào thịt heo xay với nấm mèo đến khi chín, nêm vừa ăn", 480, ["Hành tím", "Thịt heo xay"]],
    ["Hấp nóng bánh cuốn", 120, ["Bánh cuốn"]],
    ["Trải bánh, cho nhân vào, cuộn lại", null, []],
    ["Thái chả lụa, xếp kèm bánh cuốn, chấm nước mắm chua ngọt", null, ["Chả lụa"]],
  ],
  "Bún mọc": [
    ["Chần xương heo 5 phút, rửa sạch", 300, ["Xương heo"]],
    ["Ninh xương lấy nước dùng, hớt bọt", 5400, []],
    ["Ngâm nấm hương, thái nhỏ, trộn với giò sống và hành tím băm", 600, ["Nấm hương", "Giò sống", "Hành tím"]],
    ["Viên mọc, thả vào nồi nước dùng đang sôi, nấu đến khi mọc nổi lên và chín hẳn", 480, []],
    ["Nêm nước dùng vừa ăn", 120, []],
    ["Trụng bún, cho ra tô, thêm mọc, chan nước dùng, rắc hành lá", 30, ["Bún", "Hành lá"]],
  ],
  "Mì Ý sốt bò bằm": [
    ["Băm nhỏ thịt bò, ướp chút muối và tiêu", 600, ["Thịt bò"]],
    ["Luộc mì Ý trong nước sôi có chút muối đến khi chín vừa, để ráo", 600, ["Mì Ý"]],
    ["Phi thơm tỏi và hành tây băm, xào thịt bò đến khi săn và chín", 300, ["Tỏi", "Hành tây"]],
    ["Cho cà chua băm và sốt cà chua vào, đun lửa nhỏ đến khi sốt sánh, nêm vừa ăn", 900, ["Cà chua", "Sốt cà chua"]],
    ["Trộn mì với sốt, rắc phô mai bào lên trên", null, ["Phô mai"]],
  ],
  "Cà ri gà kiểu Nhật": [
    ["Vo gạo nấu cơm; trong lúc chờ, chặt gà miếng vừa ăn, ướp muối và tiêu", 1800, ["Gạo", "Thịt gà"]],
    ["Gọt, cắt khoai tây, cà rốt và hành tây miếng vừa", null, ["Khoai tây", "Cà rốt", "Hành tây"]],
    ["Phi hành tây với dầu, cho gà vào xào săn", 300, []],
    ["Đổ nước ngập, cho khoai tây và cà rốt vào, hầm lửa nhỏ đến khi gà chín mềm", 1500, []],
    ["Đun chảy bơ, xào bột mì với bột cà ri cho thơm, hòa với nước hầm rồi đổ vào nồi, nêm vừa ăn", 180, ["Bơ lạt", "Bột mì", "Bột cà ri"]],
    ["Nấu thêm đến khi sốt sánh, chan cà ri lên cơm", 300, []],
  ],
  "Kimbap": [
    ["Nấu cơm, trộn với dầu mè, chút muối và mè, để nguội bớt", 1800, ["Gạo", "Mè"]],
    ["Tráng trứng mỏng cho chín, cắt sợi", 180, ["Trứng gà"]],
    ["Cắt sợi cà rốt, dưa leo và xúc xích; xào sơ cà rốt và xúc xích", 180, ["Cà rốt", "Dưa leo", "Xúc xích"]],
    ["Trải lá rong biển, dàn cơm, xếp nhân lên rồi cuộn chặt", null, ["Rong biển"]],
    ["Phết chút dầu mè lên cuộn, cắt khoanh", null, []],
  ],
  "Cá hồi áp chảo": [
    ["Rửa sạch cá hồi, thấm khô, ướp muối và tiêu", 600, ["Cá hồi"]],
    ["Chần bông cải xanh", 120, ["Bông cải xanh"]],
    ["Áp chảo cá, mặt da xuống, lửa vừa đến khi vàng giòn", 240, []],
    ["Lật mặt, thêm bơ và tỏi băm, rưới bơ lên cá đến khi cá chín đều", 180, ["Bơ lạt", "Tỏi"]],
    ["Vắt chanh, bày cá cùng bông cải", null, ["Chanh"]],
  ],
  "Súp bí đỏ kem": [
    ["Gọt bí đỏ, cắt miếng; thái hành tây", null, ["Bí đỏ", "Hành tây"]],
    ["Đun chảy bơ, xào hành tây cho thơm", 180, ["Bơ lạt"]],
    ["Cho bí đỏ và nước ngập vào, nấu đến khi bí mềm", 900, []],
    ["Xay nhuyễn, cho sữa tươi và kem tươi vào, đun sôi lại, nêm vừa ăn", 300, ["Sữa tươi", "Kem tươi"]],
  ],
  "Salad trộn dầu giấm": [
    ["Luộc trứng chín kỹ", 600, ["Trứng gà"]],
    ["Rửa sạch xà lách, cà chua, dưa leo; ngâm nước muối loãng", 300, ["Xà lách", "Cà chua", "Dưa leo"]],
    ["Cắt rau vừa ăn, thái hành tây mỏng, bóc trứng cắt múi", null, ["Hành tây"]],
    ["Pha dầu ô liu, giấm, đường, muối, tiêu; trộn đều với rau và trứng ngay trước khi ăn", null, []],
  ],
  "Trứng cuộn kiểu Hàn": [
    ["Băm nhỏ cà rốt và hành lá", null, ["Cà rốt", "Hành lá"]],
    ["Đánh tan trứng với chút muối, trộn rau băm vào", null, ["Trứng gà"]],
    ["Láng mỏng một lớp trứng trên chảo lửa nhỏ, khi gần se mặt thì cuộn lại", 120, []],
    ["Đổ tiếp trứng, cuộn nối đến hết, áp chảo thêm cho chín đều", 300, []],
    ["Để nguội bớt, cắt khoanh", null, []],
  ],
  "Bánh mì sandwich trứng": [
    ["Rửa sạch xà lách, thái lát cà chua", null, ["Xà lách", "Cà chua"]],
    ["Chiên trứng chín cả lòng đỏ", 180, ["Trứng gà"]],
    ["Nướng giòn bánh mì sandwich", 120, ["Bánh mì sandwich"]],
    ["Xếp trứng, phô mai, xà lách và cà chua giữa hai lát bánh, cắt chéo", null, ["Phô mai"]],
  ],
  "Gà sốt cay kiểu Hàn": [
    ["Rửa sạch đùi gà, khứa vài đường, ướp tỏi băm và chút muối", 900, ["Đùi gà", "Tỏi"]],
    ["Áp chảo đùi gà lửa vừa, đậy nắp, trở đều đến khi chín kỹ và vàng mặt", 1200, []],
    ["Pha tương ớt Hàn với đường, nước tương và chút nước", null, ["Tương ớt Hàn"]],
    ["Đổ sốt vào chảo, rim đến khi sốt sánh bám đều thịt", 300, []],
    ["Rắc mè rang và hành lá", null, ["Mè", "Hành lá"]],
  ],
  "Canh kim chi đậu phụ": [
    ["Thái thịt ba chỉ mỏng, cắt kim chi và đậu phụ miếng vừa", null, ["Thịt ba chỉ", "Kim chi", "Đậu phụ"]],
    ["Xào thịt ba chỉ với dầu đến khi săn, cho kim chi vào xào thơm", 300, []],
    ["Đổ nước, thêm tương ớt Hàn, đun sôi rồi hạ lửa nấu", 600, ["Tương ớt Hàn"]],
    ["Cho đậu phụ vào nấu thêm, nêm vừa ăn", 300, []],
    ["Rắc hành lá rồi tắt bếp", null, ["Hành lá"]],
  ],
  "Cơm chiên kim chi": [
    ["Nấu cơm từ trước, để nguội cho hạt rời", null, ["Gạo"]],
    ["Thái nhỏ thịt xông khói và kim chi", null, ["Thịt xông khói", "Kim chi"]],
    ["Phi thịt xông khói đến khi ra mỡ và chín vàng, cho kim chi vào xào", 240, []],
    ["Cho cơm vào chiên lửa lớn, nêm vừa ăn, đảo đều", 300, []],
    ["Chiên trứng ốp la chín, đặt lên cơm, rắc hành lá, rưới dầu mè", 180, ["Trứng gà", "Hành lá"]],
  ],
  "Bò bít tết": [
    ["Thấm khô thịt bò, ướp muối và tiêu, để ở nhiệt độ phòng", 900, ["Thịt bò"]],
    ["Luộc khoai tây cắt múi đến khi chín, để ráo", 600, ["Khoai tây"]],
    ["Làm nóng chảo thật nóng với dầu, áp chảo bò mỗi mặt 3 phút", 360, []],
    ["Thêm bơ và tỏi, rưới bơ lên thịt, áp thêm khoai tây cho vàng", 120, ["Bơ lạt", "Tỏi"]],
    ["Để thịt nghỉ 5 phút rồi cắt, ăn kèm khoai, xà lách và cà chua", 300, ["Xà lách", "Cà chua"]],
  ],
  "Khoai tây nghiền": [
    ["Gọt vỏ, cắt khoai tây miếng vừa", null, ["Khoai tây"]],
    ["Luộc khoai tây đến khi thật mềm, để ráo", 1200, []],
    ["Nghiền khoai khi còn nóng với bơ", null, ["Bơ lạt"]],
    ["Đổ sữa tươi ấm vào, khuấy mịn, nêm vừa ăn", 120, ["Sữa tươi"]],
  ],
  "Súp nấm kem": [
    ["Rửa sạch, thái lát nấm mỡ; băm hành tây", null, ["Nấm mỡ", "Hành tây"]],
    ["Đun chảy bơ, xào hành tây và nấm cho thơm", 300, ["Bơ lạt"]],
    ["Rắc bột mì vào, đảo đều", 60, ["Bột mì"]],
    ["Đổ sữa tươi và nước từ từ, khuấy đều, nấu lửa nhỏ đến khi súp sánh", 600, ["Sữa tươi"]],
    ["Cho kem tươi vào, đun sôi lại, nêm vừa ăn", 120, ["Kem tươi"]],
  ],
};

export type SeedStep = {
  order: number;
  instruction: string;
  durationSeconds: number | null;
  ingredients: Array<{ name: string; quantity: number | null; unit: string | null }>;
};

/** Steps for a starter dish, with each ingredient's quantity and unit from the dish; null when there are none. */
export function stepsFor(recipe: SeedRecipe): SeedStep[] | null {
  const rows = STEPS[recipe.name];
  if (!rows) return null;
  return rows.map(([instruction, durationSeconds, names], index) => ({
    order: index + 1,
    instruction,
    durationSeconds,
    ingredients: names.map((name) => {
      const ingredient = recipe.ingredients.find((entry) => entry.name === name);
      return { name, quantity: ingredient?.quantity ?? null, unit: ingredient?.unit ?? null };
    }),
  }));
}

/** Dish names that have starter steps (used by tests). */
export const dishesWithSteps = (): string[] => seedRecipes.filter((recipe) => STEPS[recipe.name]).map((recipe) => recipe.name);
export const stepRowsFor = (name: string): StepRow[] | undefined => STEPS[name];
