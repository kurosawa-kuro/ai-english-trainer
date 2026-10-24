function doGet() {
  return HtmlService.createTemplateFromFile("client/index")
    .evaluate()
    .setTitle("AI英語訓練")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}
function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("英語訓練")
    .addItem("初期設定・中断から再開", "initializeTrainer")
    .addToUi();
}
function initializeTrainer() {
  const result = Seeder.initialize();
  SpreadsheetApp.getUi().alert(
    "初期設定が完了しました。ウェブアプリを本人のみでデプロイし、設定画面でキーを登録してください。",
  );
  return result;
}
function onEdit() {
  TableCache.clear();
}
