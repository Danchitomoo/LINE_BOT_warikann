function get_message(json) {
  return json.events[0].message.text
}

function send_reply(replyToken, messages) {
  conf = config()
  // メッセージを返信
  var reply_messages = messages.map(function (message) {
    return {'type': 'text', 'text': message};    
  });

  // line-bot-sdk-gas のライブラリを利用しています ( https://github.com/kobanyan/line-bot-sdk-gas )
  const linebotClient = new LineBotSDK.Client({ channelAccessToken: conf.CHANNEL_ACCESS_TOKEN });

  // メッセージを返信
  linebotClient.replyMessage(replyToken, reply_messages);
}

function get_replyToken(json) {
  return json.events[0].replyToken
}

function get_userId(json) {
  try {
    return json.events[0].source.userId
  } catch(error) {
    return 'unknown'
  }
}

function get_groupId(json) {
  try {
    return json.events[0].source.groupId
  } catch(error) {
    return 'unknown'
  }
}

function message_validation(message) {
  const numbers = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
  for (const value of message.slice(0, message.length-1)) {
    if (!numbers.has(value)) {
      return false
    }
  }
  if (message[message.length - 1] === '人' || message[message.length - 1] === '円') {
    return true
  }
  return false
}

function is_start_warikann(message) {
  return (message[message.length - 1] === '人') 
}

async function act_warikann(message, groupId) {
  try {
    const number_of_people_String = message.slice(0, message.length-1)
    const number_of_people = Number(number_of_people_String)
    const model = new Model()
    const conditions = [
      {key: "group_id", value: groupId},
      {key: "is_payed", value: false},
    ]

    const payed_data = model.getData('payed_money', conditions)

    const each_payment = calculate_each_payment(payed_data, number_of_people)
    if (each_payment.result != 'Success') {
      return [each_payment.result]
    }

    var messages = []
    messages.push(`${number_of_people}人で割り勘をした結果です`)
    const keys_without_payed_people = new Set(['result', 'residue', 'others', 'number_of_others'])
    for (const key of Object.keys(each_payment)) {
      if (!keys_without_payed_people.has(key)) {
        userId = String(key)
        user_name = await get_username(userId)
        if (each_payment[key] < 0){
          messages.push(`${user_name}さんは${-each_payment[key]}円多く払っています。`)
        } else {
          messages.push(`${user_name}さんはあと${each_payment[key]}円払う必要があります。`)
        }
      }
    }
    if (each_payment.number_of_others > 0) {
      messages.push(`他の${each_payment.number_of_others}人の方は${each_payment.others}円ずつ払ってください`)
    }
    if (each_payment.residue > 0) {
      messages.push(`あまりは${each_payment.residue}円なので相談して支払ってください。`)
    }

    const update_key_value_pair = {"is_payed": true}
    const conditions_to_update = [
      {key: "group_id", value: groupId},
      {key: "is_payed", value: false}
    ]

    model.updateData("payed_money", update_key_value_pair, conditions_to_update)  
    return messages
  } catch (e) {
    return [`Error: ${e}`]
  }
}

async function get_username(userId) {
  const conf = config();
  const linebotClient = new LineBotSDK.Client({ channelAccessToken: conf.CHANNEL_ACCESS_TOKEN });

  const user_profile = await linebotClient.getProfile(userId);
  return user_profile.displayName;

  /*try {
    const user_profile = await linebotClient.getProfile(userId);
    return user_profile.displayName;
  } catch (error) {
    Logger.log("エラーが発生しました: " + error);
    return null;
  } */
}

function calculate_each_payment(payed_data, number_of_people) {
  try {
    var each_payment = {};
    var sum_payment = 0;

    // 支払いデータを処理
    for (const each_data of payed_data) {
      sum_payment += Number(each_data.money);
      
      if (each_data.user_id in each_payment) {
        each_payment[each_data.user_id] -= Number(each_data.money);
      } else {
        each_payment[each_data.user_id] = -Number(each_data.money);
      }
    }

    if (sum_payment == 0) {
      return {"result": '未清算の支払いはありません'}
    }

    const number_of_paid_people = Object.keys(each_payment).length;

    // 支払いを行った人数が参加人数を超えているか確認
    if (number_of_paid_people > number_of_people) {
      return {"result": '支払いを行った方の人数が割り勘をする人数よりも少ないです'};
    }

    // 残額を計算
    const residue = sum_payment % number_of_people;
    const money_per_person = (sum_payment - residue) / number_of_people;

    // 各人の支払額を更新
    for (const key of Object.keys(each_payment)) {
      each_payment[key] += money_per_person;
    }
    
    // その他の情報を追加
    each_payment.others = money_per_person;
    each_payment.residue = residue;
    each_payment.result = 'Success';
    each_payment.number_of_others = number_of_people - number_of_paid_people;

    return each_payment;
  } catch (e) {
    return {"result": "Error"};
  }
}


function accept_payed_money(message, groupId, userId) {
  const model = new Model();
  
  const moneyString = message.slice(0, message.length - 1);
  const money = Number(moneyString);

  // 金額が有効であるか確認
  if (isNaN(money)) {
    Logger.log("無効な金額: " + moneyString);
    return; // エラー処理
  }

  // 現在の日時をISO形式で取得
  const now_time = new Date().toISOString();

  // データを挿入するためのオブジェクトを作成
  const keyValuePairs = [{
    "group_id": groupId,
    "user_id": userId,
    "money": money,
    "is_payed": false,
    "created_at": now_time,
  }];

  // データベースに挿入
  try {
    const result = model.insertData("payed_money", keyValuePairs);
    return ['支払い情報を登録しました']
    Logger.log("データ挿入成功: " + JSON.stringify(result));
  } catch (error) {
    return ['Error has occured when inserting to DB']
    Logger.log("データ挿入エラー: " + error);
  }
}
