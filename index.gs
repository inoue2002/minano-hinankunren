const ACCESS_TOKEN = "アクセストークンを書き換える";

// スプレッドシートに 「log」「user」の2種類のシートを作成する
// 「今すぐ始める」とBotに送信して開始、位置情報を送信することで、距離を測ってくれる

const LOG_SHEET = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('log')
const LOG_SHEET_LAST_ROW = LOG_SHEET.getLastRow()
const USER_SHEET = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('user')
const USER_SHEET_LAST_ROW = USER_SHEET.getLastRow()

async function doPost(e) {
  for (let i = 0; i < JSON.parse(e.postData.contents).events.length; i++) {
    const event = JSON.parse(e.postData.contents).events[i];
    const message = await eventHandle(event);
    LOG_SHEET.appendRow([new Date(), event.source.userId, event.message])
    //応答するメッセージがあった場合
    if (message !== undefined) {
      try {
        const replyToken = event.replyToken;
        const replyUrl = "https://api.line.me/v2/bot/message/reply";
        UrlFetchApp.fetch(replyUrl, {
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
            Authorization: "Bearer " + ACCESS_TOKEN,
          },
          method: "post",
          payload: JSON.stringify({
            replyToken: replyToken,
            messages: message,
          }),
        });
      } catch (error) {
        LOG_SHEET.appendRow('メッセージ返信でError', error)
      }
    }
  }
  return ContentService.createTextOutput(
    JSON.stringify({ content: "post ok" })
  ).setMimeType(ContentService.MimeType.JSON);
}

async function eventHandle(event) {
  let message;
  switch (event.type) {
    case "message":
      message = await messagefunc(event);
      break;
    case "postback":
      message = await postbackFunc(event);
      break;
    case "follow":
      message = await followFunc(event);
      break;
    case "unfollow":
      message = unfolowFunc(event);
      break;
  }
  return message;
}
//メッセージイベントの処理
async function messagefunc(event) {
  if (event.message.type === "location") {
    return locationFunc(event)
  }
  if (event.message.text === "今すぐ始める") {
    return [{
      "type": "flex",
      "altText": "避難訓練を始めるためには設定が必要です！",
      "contents": {
        "type": "bubble",
        "direction": "ltr",
        "header": {
          "type": "box",
          "layout": "vertical",
          "contents": [
            {
              "type": "text",
              "text": "現在地を送信してね",
              "size": "lg",
              "align": "center",
              "contents": []
            }
          ]
        },
        "footer": {
          "type": "box",
          "layout": "horizontal",
          "contents": [
            {
              "type": "button",
              "action": {
                "type": "uri",
                "label": "位置情報を送信する",
                "uri": "https://line.me/R/nv/location/"
              },
              "style": "secondary"
            }
          ]
        }
      }
    }]
  }
  return { type: "text", text: "「今すぐ始める」と送信しよう！" };
}

async function locationFunc(event) {
  const address = event.message.address
  const latitude = event.message.latitude
  const longitude = event.message.longitude
  LOG_SHEET.appendRow(['位置情報が送られてきました', address, latitude, longitude])
  const userState = await getState(event)
  if (userState == "訓練中") {
    writeState(event, '訓練終了')
    const beforeLocation = JSON.parse(await getLocation(event))
    const directions = Maps.newDirectionFinder()
      .setLanguage('ja')
      .setOrigin(beforeLocation.address)
      .setDestination(event.message.address)
      .setMode(Maps.DirectionFinder.Mode.TRANSIT)
      .setDepart(new Date())
      .getDirections();
    const route = directions["routes"][0]
    const duration = route["legs"][0].duration.text;//所要時間
    const distance = route["legs"][0].distance.text;//距離
    /*
    { type: "text", text: `結果発表！\n あなたは${distance}避難しましたね！\n今後は防災訓練の情報を沢山発信していきますのでみんなで意識を高めていきましょう！` }
    */
    return [{
      "type": "flex",
      "altText": "避難訓練開始！",
      "contents":
      {
        "type": "bubble",
        "direction": "ltr",
        "header": {
          "type": "box",
          "layout": "vertical",
          "contents": [
            {
              "type": "text",
              "text": "【結果発表！】",
              "align": "center",
              "contents": []
            }
          ]
        },
        "body": {
          "type": "box",
          "layout": "vertical",
          "contents": [
            {
              "type": "text",
              "text": `今回の訓練で${distance}訓練しました！`,
              "align": "center",
              "contents": []
            }
          ]
        }
      }
    }, {
      "type": "flex",
      "altText": "避難訓練開始！",
      "contents":
      {
        "type": "bubble",
        "direction": "ltr",
        "header": {
          "type": "box",
          "layout": "vertical",
          "contents": [
            {
              "type": "text",
              "text": "【オススメ記事】",
              "align": "center",
              "contents": []
            }
          ]
        },
        "hero": {
          "type": "image",
          "url": "https://www3.nhk.or.jp/news/special/saigai/basic-knowledge/still/basic-knowledge_20190725_10_thumb.jpg",
          "size": "full",
          "aspectRatio": "1.51:1",
          "aspectMode": "fit",
          "action": {
            "type": "uri",
            "uri": "https://www3.nhk.or.jp/news/special/saigai/basic-knowledge/basic-knowledge_20190725_10.html"
          }
        },
        "footer": {
          "type": "box",
          "layout": "horizontal",
          "contents": [
            {
              "type": "text",
              "text": "災害に遭う前に 生活のために備蓄しよう",
              "contents": []
            }
          ]
        }
      }
    }]
  } else {
    await updateLocation(event)
    writeState(event, '訓練中')
    // 近くの避難所を(event)からAPIを取得して、5つをメッセージに入れて返す
    return [{
      "type": "flex",
      "altText": "避難訓練開始！",
      "contents":
      {
        "type": "bubble",
        "direction": "ltr",
        "header": {
          "type": "box",
          "layout": "vertical",
          "contents": [
            {
              "type": "text",
              "text": "近くの避難所に逃げよう！",
              "weight": "bold",
              "size": "xl",
              "contents": []
            }
          ]
        },
        "hero": {
          "type": "image",
          "url": "https://3.bp.blogspot.com/-2cK_jCDmwfg/UnIDuiJdOlI/AAAAAAAAZ6Y/ZrDYZ7X0ArM/s500/saigai_hinan.png",
          "size": "full",
          "aspectRatio": "1.51:1",
          "aspectMode": "fit"
        },
        "footer": {
          "type": "box",
          "layout": "horizontal",
          "contents": [
            {
              "type": "button",
              "action": {
                "type": "uri",
                "label": "避難し終わったら現在地を送信",
                "uri": "https://line.me/R/nv/location/"
              },
              "style": "secondary"
            }
          ]
        }
      }
    }, {
      "type": "flex",
      "altText": "避難訓練開始！",
      "contents":
      {
        "type": "bubble",
        "size": "micro",
        "direction": "ltr",
        "header": {
          "type": "box",
          "layout": "vertical",
          "contents": [
            {
              "type": "text",
              "text": "[GOAL]避難所1",
              "size": "xs",
              "align": "center",
              "contents": []
            }
          ]
        },
        "hero": {
          "type": "image",
          "url": "https://4.bp.blogspot.com/-HJswnQNpI2A/UZmB9YzilXI/AAAAAAAATYY/DPn1NBHu7pA/s400/house_1f.png",
          "size": "full",
          "aspectRatio": "1.51:1",
          "aspectMode": "fit"
        }
      }
    }]
  }
}

//ポストバックイベントの処理
async function postbackFunc(event) {
  return [{ type: "text", text: event.postback.data }];
}
//友達登録時の処理
async function followFunc(event) {
  intUser(event)
  return [{ type: "text", text: "友達登録ありがとうございます!" }];
}
//友達解除後の処理
async function unfollowFunc() {
  return undefined;
}

// イベントを受け取った時にユーザー情報があるかどうかを確認し、なかった時は追加しておく
async function intUser(event) {
  const userId = event ? event.source.userId : "Uf69d85f3938f7643be43228df8b2e2d3"
  const userProfile = await get_profile(userId)
  console.log(userProfile)
  // ユーザー情報が登録されているかどうかを確認する
  const users = USER_SHEET.getRange(`A1:H${USER_SHEET_LAST_ROW}`).getValues()
  const filter = users.filter((user) => { return user[0] === userId })
  console.log(filter)
  if (filter.length > 0) {
    console.log('合致')
  } else {
    console.log('合致しませんでした')
    console.log('ユーザーを追加します')
    USER_SHEET.appendRow([userId, userProfile.displayName, "prefecture", "startDate"])
  }
  return
}

// ユーザー情報を取得する
function get_profile(userId) {
  try {
    const options = {
      "method": "GET",
      "headers": {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
      },
    };
    const response = UrlFetchApp.fetch(`https://api.line.me/v2/bot/profile/${userId}`, options);
    return JSON.parse(response.getContentText());
  } catch (ex) {
    return {
      "displayName": "",
      "userId": "",
      "language": "",
      "pictureUrl": "",
      "statusMessage": ""
    }
  }
}

// userIdでStateを変更する
async function writeState(event, state) {
  const userId = event ? event.source.userId : "Uf69d85f3938f7643be43228df8b2e2d3"
  const inputState = state ? state : 'テスト'
  const users = USER_SHEET.getRange(`A1:H${USER_SHEET_LAST_ROW}`).getValues()
  let isWrote = false
  for (let i = 0; i < users.length; i++) {
    const users_userId = users[i][0]
    if (userId === users_userId) {
      console.log(users_userId)
      USER_SHEET.getRange(`H${i + 1}`).setValue(inputState)
      isWrote = true
    }
  }
  if (isWrote) {
    console.log('変更を行いました')
    LOG_SHEET.appendRow(['変更を行いました', userId, JSON.stringify(inputState)])
  } else {
    console.log('変更がありませんでした')
    LOG_SHEET.appendRow(['変更しようとしましたがuserIdが見つかりませんでした', userId, inputState])
  }
}

// 訓練開始時の位置情報を保存しておく
async function updateLocation(event) {
  const userId = event ? event.source.userId : "Uf69d85f3938f7643be43228df8b2e2d3"
  const inputLocation = event ? event.message : { "address": '滋賀県大津市木下町6-24', latitude: 0, longitude: 0 }
  LOG_SHEET.appendRow['イチ', inputLocation]
  const users = USER_SHEET.getRange(`A1:H${USER_SHEET_LAST_ROW}`).getValues()
  let isWrote = false
  for (let i = 0; i < users.length; i++) {
    const users_userId = users[i][0]
    if (userId === users_userId) {
      console.log(users_userId)
      USER_SHEET.getRange(`E${i + 1}`).setValue(inputLocation.address)
      USER_SHEET.getRange(`F${i + 1}`).setValue(inputLocation.longitude)
      USER_SHEET.getRange(`G${i + 1}`).setValue(inputLocation.latitude)
      isWrote = true
    }
  }
  if (isWrote) {
    console.log('変更を行いました')
    LOG_SHEET.appendRow(['location変更を行いました', userId, inputLocation])
  } else {
    console.log('変更がありませんでした')
    LOG_SHEET.appendRow(['location変更しようとしましたがuserIdが見つかりませんでした', userId, inputLocation])
  }
}

async function getState(event) {
  const userId = event ? event.source.userId : "Uf69d85f3938f7643be43228df8b2e2d3"
  const users = USER_SHEET.getRange(`A1:H${USER_SHEET_LAST_ROW}`).getValues()
  let users_state = ""
  let isChange = false
  for (let i = 0; i < users.length; i++) {
    if (userId === users[i][0]) {
      console.log(users[i])
      users_state = users[i][7]
      isChange = true
    }
  }
  if (isChange) {
    console.log('該当の項目がありました', users_state)
    LOG_SHEET.appendRow(["項目を取得しました", userId, users_state])
    return users_state
  } else {
    console.log('該当の項目がありませんでした')
    LOG_SHEET.appendRow(["該当の項目がありませんでした", userId, users_state])
    return null
  }
}

async function getLocation(event) {
  const userId = event ? event.source.userId : "Uf69d85f3938f7643be43228df8b2e2d3"
  const users = USER_SHEET.getRange(`A1:H${USER_SHEET_LAST_ROW}`).getValues()
  let users_address = ""
  let users_longitude = ""
  let users_latitude = ""
  let isChange = false
  for (let i = 0; i < users.length; i++) {
    if (userId === users[i][0]) {
      console.log(users[i])
      users_address = users[i][4]
      users_longitude = users[i][5]
      users_latitude = users[i][6]

      isChange = true
    }
  }
  if (isChange) {
    console.log('location該当の項目がありました', users_address)
    LOG_SHEET.appendRow(["location項目を取得しました", userId, users_address])
    return JSON.stringify({ address: users_address, longitude: users_longitude, latitude: users_latitude }, null, '\t');
  } else {
    console.log('location該当の項目がありませんでした')
    LOG_SHEET.appendRow(["location該当の項目がありませんでした", userId, users_address])
    return null
  }
}
