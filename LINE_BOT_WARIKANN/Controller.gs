//ポストで送られてくるので、ポストデータ取得
async function doPost(e) {
  // LINEBotから送られてきたデータを、プログラムで利用しやすいようにJSON形式に変換する
  const json = JSON.parse(e.postData.contents);

  //返信するためのトークン取得
  const replyToken= get_replyToken(json);
  if (typeof replyToken === 'undefined') {
    return;
  }

  const message = get_message(json)

  var reply_message = 'Success'
  if (!message_validation(message)) {
    return
    //reply_message = ['正しく入力してください']
  } else if (is_start_warikann(message)) {
    groupId = get_groupId(json)
    reply_message = await act_warikann(message, groupId)
  } else {
    const userId = get_userId(json)
    const groupId = get_groupId(json)
    reply_message = accept_payed_money(message, groupId, userId)
  }

  send_reply(replyToken, reply_message)

  return ContentService.createTextOutput(JSON.stringify({'content': 'post ok'})).setMimeType(ContentService.MimeType.JSON);
}