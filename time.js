function main() {
  try {

    if (process.argv.length < 6) {
      console.log('引数が足りていません。');
      console.log('');
      console.log('使用方法: node time.js <期> <所定出勤日数> <繰越時間> <休暇> <実出勤日数> <総労働時間>');
      console.log('');
      console.log('引数の説明:');
      console.log('  <期>: 何期かを入力。 例) 7');
      console.log('  <所定出勤日数>: TS記載の3ヶ月の所定出勤日数。例) "[20,21,19]"');
      console.log('  <繰越時間>: TS記載の繰越時間。例) "8:30" または "-2:15"');
      console.log('  <休暇>: 取得した休暇を入力します。※承認されいない場合は入れないでください。今期以外は含めない。');
      console.log('        半休は含めない。半休の日は + 4働いたと脳内で計算してください。今月以外は入れても入れなくても計算は変わらないので好きにしてください。');
      console.log('        例) "[9/1,10/30]"');
      console.log('  <実出勤日数>: TS記載の繰越時間を入力します。 例) 2 [備考 休暇日数は含まれていない]');
      console.log('  <総労働時間>: TS記載の総労働時間。例) "160:00" [備考 当月の承認済み休暇は8時間加算されている]');
      console.log('  出勤中はややこしいので退勤後に実行してね');
      console.log('');
      console.log('使用例:');
      console.log('  node time.js "[20,21,19]" "8:30" "[9/1,10/3,1/30]" "2" "160:00"');
      return;
    }

    // -------------------- 引数格納 --------------------
    const period = parseInt(process.argv[2])
    const needWorkDayCountList = process.argv[3]
      .replace(/[\[\]]/g, '')
      .split(',')
      .map(str => parseInt(str.trim()))
      .filter(num => !isNaN(num));

    const carryoverMinutes = convertTimeStringToMinutes(process.argv[4])
    const holidays = convertMMDDToDateMap(process.argv[5], period)
    const workedDayCount = parseInt(process.argv[6])
    const totalWorkedMinutesInToMonth = convertTimeStringToMinutes(process.argv[7])

    // -------------------- 入力内容出力 --------------------
    console.log(`入力内容`);
    console.log(`期=> ${period}期`);
    console.log(`所定出勤日数=> ${needWorkDayCountList}`);
    console.log(`繰越時間=> ${convertMinutesToTimeString(carryoverMinutes)}`);
    console.log(`休暇=> ${getHolidayStrings(holidays)}`);
    console.log(`実出勤日数(今月:休暇は含まない)=> ${workedDayCount}日`);
    console.log(`総労働時間(今月:有給+8,半休+4で加算されている))=> ${convertMinutesToTimeString(totalWorkedMinutesInToMonth)}`);

    const today = new Date();
    // const today = new Date(2025, 11 - 1, 3, 0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    console.log(`実行日=> ${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`);

    // -------------------- ロジック --------------------
    const monthPosition = getMonthPosition(today.getMonth() + 1);
    const enableWorkDays = calculateEnableWorkDays(holidays, today, getNakedRemaindWorkDayCount(workedDayCount, needWorkDayCountList, monthPosition));
    const totalWorkedMinutes = calculateTotalWorkedMinutes(monthPosition, totalWorkedMinutesInToMonth, carryoverMinutes, needWorkDayCountList);
    const remainingWorkMinutes = calculateRemainingWorkMinutes(needWorkDayCountList, totalWorkedMinutes);
    const dailyRequiredWorkMinutes = calculateDailyRequiredWorkMinutes(remainingWorkMinutes, enableWorkDays);
    const dailyLimitWorkMinutes = calculateDailyRequiredWorkMinutes(remainingWorkMinutes + 1200, enableWorkDays);
    console.log(`1日の平均必要労働時間=> ${convertMinutesToTimeString(dailyRequiredWorkMinutes)}`);
    console.log(`1日の平均最大労働時間=> ${convertMinutesToTimeString(dailyLimitWorkMinutes)}`);
  } catch (error) {
    console.error('エラー:', error.message);
    process.exit(1);
  }
}

main();

function calculateDailyRequiredWorkMinutes(remainingWorkMinutes, enableWorkDays) {
  if (enableWorkDays <= 0) {
    return 0; // 労働日数が0以下の場合は0を返す
  }

  // 1日の平均必要労働時間を計算
  const dailyRequiredMinutes = Math.ceil(remainingWorkMinutes / enableWorkDays);

  return dailyRequiredMinutes;
}

function calculateRemainingWorkMinutes(needWorkDayCountList, totalWorkedMinutes) {
  const totalRequiredMinutes = needWorkDayCountList.reduce((sum, days) => sum + (days * 480), 0);
  return totalRequiredMinutes - totalWorkedMinutes;
}

function calculateTotalWorkedMinutes(monthPosition, totalWorkedTimeInToMonth, carryoverMinutes, needWorkDayCountList) {
  if (monthPosition === 0) {
    return totalWorkedTimeInToMonth;
  } else if (monthPosition === 1) {
    const firstMonthWorkMinutes = needWorkDayCountList[0] * 480; // 初月の所定労働時間（分）
    return firstMonthWorkMinutes - carryoverMinutes + totalWorkedTimeInToMonth;
  } else if (monthPosition === 2) {
    const firstMonthWorkMinutes = needWorkDayCountList[0] * 480; // 初月の所定労働時間（分）
    const secondMonthWorkMinutes = needWorkDayCountList[1] * 480; // 真ん中の月の所定労働時間（分）
    return firstMonthWorkMinutes + secondMonthWorkMinutes - carryoverMinutes + totalWorkedTimeInToMonth;
  }
}

function calculateEnableWorkDays(holidays, today, nakedRemaindWorkDays) {
  let enableWorkDays = nakedRemaindWorkDays;

  for (const [key, status] of holidays.entries()) {
    if (isCurrentMonthHoliday(key, today)) {
      enableWorkDays--;
    }
  }

  return enableWorkDays;
}

function getMonthPosition(month) {
  return (month - 1) % 3;
}

function getHolidayStrings(holidays) {
  const holidayStrings = Array.from(holidays.entries()).map(([date, status]) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    let prefixText = '';
    let suffixText = '';

    if (!status.isFull) {
      suffixText = '(半)';
    }

    return `${prefixText}${year}年${month}月${day.toString().padStart(2, '0')}日${suffixText}`;
  });
  return holidayStrings.join('／');
}

function convertTimeStringToMinutes(timeString) {
  const isNegative = timeString.startsWith('-');
  const cleanTimeString = isNegative ? timeString.substring(1) : timeString;
  const [hours, minutes] = cleanTimeString.split(':').map(str => parseInt(str));
  const totalMinutes = hours * 60 + minutes;
  return isNegative ? -totalMinutes : totalMinutes;
}

function convertMinutesToTimeString(totalMinutes) {
  const isNegative = totalMinutes < 0;
  const absMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  const timeString = `${hours}:${minutes.toString().padStart(2, '0')}`;
  return isNegative ? `-${timeString}` : timeString;
}

function convertMMDDToDateMap(dateArrayString, period) {
  const dateNumbers = dateArrayString
    .replace(/[\[\]]/g, '')
    .split(',')
    .map(str => str.trim())
    .filter(str => str !== '');

  const result = new Map();

  dateNumbers.forEach(dateStr => {
    let isFull = true;

    // 先頭に'h'があるかチェック（半休）
    if (dateStr.startsWith('h')) {
      isFull = false;
      dateStr = dateStr.substring(1); // 'h'を除去
    }

    // 10/5形式を解析
    const [month, day] = dateStr.split('/').map(str => parseInt(str));
    if (!isNaN(month) && !isNaN(day)) {
      const year = calculateYear(month, period);
      // JSTの0時で作成
      const date = new Date(year, month - 1, day, 0, 0, 0, 0);
      result.set(date, { isFull });
    }
  });

  return result;
}

function calculateYear(month, period) {
  const baseYear = 2025; // 7期の基準年
  const periodOffset = period - 7; // 7期からのオフセット

  if (month >= 7) {
    // 7-12月は期の開始年
    return baseYear + periodOffset;
  } else {
    // 1-6月は期の終了年（次の年）
    return baseYear + periodOffset + 1;
  }
}

function getNakedRemaindWorkDayCount(workedDayCount, needWorkDayCountList, monthPosition) {
  // 残りの月の配列を取得
  const remainingMonths = needWorkDayCountList.slice(monthPosition);
  // 残りの労働日数を計算
  const remainingDays = remainingMonths.reduce((sum, days) => sum + days, 0) - workedDayCount;
  return remainingDays;
}

function isCurrentMonthHoliday(holidayDate, today) {
  // 今日の年と月を取得
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1; // 0ベースなので+1

  // 休暇の年と月を取得
  const holidayYear = holidayDate.getFullYear();
  const holidayMonth = holidayDate.getMonth() + 1; // 0ベースなので+1

  // 今月かどうかを判定
  return holidayYear === todayYear && holidayMonth === todayMonth;
}
