function main() {
  try {

    if (process.argv.length < 8) {
      console.log('引数が足りていません。');
      console.log('');
      console.log('使用方法: node time.js <勤務開始時間> <所定出勤日数> <繰越時間> <休暇> <実出勤日数> <総労働時間>');
      console.log('');
      console.log('引数の説明:');
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
      console.log('node time.js 9:25 "[20,21,19]" 8:30 "[9/1,10/3,1/30]" 2 160:00');
      return;
    }

    // -------------------- 本日 --------------------
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // -------------------- 引数格納 --------------------
    const startTime = convertTimeStringToMinutes(process.argv[2])
    const needWorkDayCountList = process.argv[3]
      .replace(/[\[\]]/g, '')
      .split(',')
      .map(str => parseInt(str.trim()))
      .filter(num => !isNaN(num));

    const carryoverMinutes = convertTimeStringToMinutes(process.argv[4])
    const holidays = convertMMDDToDateMap(process.argv[5], today)
    const workedDayCount = parseInt(process.argv[6])
    const totalWorkedMinutesInToMonth = convertTimeStringToMinutes(process.argv[7])

    // -------------------- 入力内容出力 --------------------
    console.log(`-------------- 入力内容 ------------------`);
    console.log(`勤務開始時間=> ${convertMinutesToTimeString(startTime)}`);
    console.log(`所定出勤日数=> ${needWorkDayCountList}`);
    console.log(`繰越時間=> ${convertMinutesToTimeString(carryoverMinutes)}`);
    console.log(`休暇=> ${getHolidayStrings(holidays)}`);
    console.log(`実出勤日数=> ${workedDayCount}日`);
    console.log(`総労働時間=> ${convertMinutesToTimeString(totalWorkedMinutesInToMonth)}`);

    console.log(`実行日=> ${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`);

    // -------------------- ロジック --------------------
    const monthPosition = getMonthPosition(today.getMonth() + 1);
    const enableWorkDays = calculateEnableWorkDays(holidays, today, getNakedRemaindWorkDayCount(workedDayCount, needWorkDayCountList, monthPosition));
    const totalWorkedMinutes = calculateTotalWorkedMinutes(monthPosition, totalWorkedMinutesInToMonth, carryoverMinutes, needWorkDayCountList);
    const remainingWorkMinutes = calculateRemainingWorkMinutes(needWorkDayCountList, totalWorkedMinutes);
    const dailyRequiredWorkMinutes = calculateDailyRequiredWorkMinutes(remainingWorkMinutes, enableWorkDays);
    const dailyLimitWorkMinutes = calculateDailyRequiredWorkMinutes(remainingWorkMinutes + 1200, enableWorkDays);
    console.log(`-------------- 結果 ------------------`);
    console.log(`1日の平均必要労働時間=> ${convertMinutesToTimeString(dailyRequiredWorkMinutes)} (勤務終了時間: ${calculateEndTime(startTime, dailyRequiredWorkMinutes + 60)})`);
    console.log(`1日の平均最大労働時間=> ${convertMinutesToTimeString(dailyLimitWorkMinutes)} (勤務終了時間: ${calculateEndTime(startTime, dailyLimitWorkMinutes + 60)})`);
    console.log(`-------------- 使用は自己責任でお願いしますね ------------------`);
  } catch (error) {
    console.error('エラー:', error.message);
    process.exit(1);
  }
}

main();

function calculateDailyRequiredWorkMinutes(remainingWorkMinutes, enableWorkDays) {
  return enableWorkDays <= 0 ? 0 : Math.ceil(remainingWorkMinutes / enableWorkDays);
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
    return firstMonthWorkMinutes + carryoverMinutes + totalWorkedTimeInToMonth;
  } else if (monthPosition === 2) {
    const firstMonthWorkMinutes = needWorkDayCountList[0] * 480; // 初月の所定労働時間（分）
    const secondMonthWorkMinutes = needWorkDayCountList[1] * 480; // 真ん中の月の所定労働時間（分）
    return firstMonthWorkMinutes + secondMonthWorkMinutes + carryoverMinutes + totalWorkedTimeInToMonth;
  }
}

function calculateEnableWorkDays(holidays, today, nakedRemaindWorkDays) {
  let enableWorkDays = nakedRemaindWorkDays;

  for (const [key, status] of holidays.entries()) {
    // なぜ今月だけ労働可能日数を引くのか。
    // 過去の月:TS上の実勤務日数と無関係。すでに計算された分は計算されて繰越時間に加算されている。それが有給で加算されたか否かはどうでもいい。
    // 未来の月:実労働時間に加算されないので、働かないでいい8時間が計算されていないので、-1になる可能労働日数を引かなくてもプラマイ0になるので残りの平均計算に影響しない。
    // 今月:承認された有給は総労働時間に加算されているので、残りの労働可能時間から1日を引く。これは取得済みでも未取得でも同じ。
    // なぜなら仮に出勤日数が5日で残り労働可能日数が10の場合未取得の有給が1日あったとしたら、働ける日数は10-5-1=4日になる。
    // なぜなら仮に出勤日数が5日で残り労働可能日数が10の場合取得済みの有給が1日あったとしたら、実質消化している労働日数は6日(TS上は5日になっている)ので 10-(5+1)=4日になる。
    // よって今月の有給は無条件に1日引く。
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

    return `${year}年${month}月${day.toString().padStart(2, '0')}日`;
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

function convertMMDDToDateMap(dateArrayString, today) {
  const dateNumbers = dateArrayString
    .replace(/[\[\]]/g, '')
    .split(',')
    .map(str => str.trim())
    .filter(str => str !== '');

  const result = new Map();
  const currentYear = today.getFullYear();

  dateNumbers.forEach(dateStr => {
    // 10/5形式を解析
    const [month, day] = dateStr.split('/').map(str => parseInt(str));
    if (!isNaN(month) && !isNaN(day)) {
      let year = currentYear;

      // 7月からスタートする年度の判定
      if (month < 7) {
        // 1-6月は次の年
        year = currentYear + 1;
      }
      const date = new Date(year, month - 1, day, 0, 0, 0, 0);
      result.set(date, { isApproved: true, isFull: true });
    }
  });

  return result;
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

function calculateEndTime(startTimeMinutes, workMinutes) {
  const endTotalMinutes = startTimeMinutes + workMinutes;
  const endHour = Math.floor(endTotalMinutes / 60) % 24;
  const endMinute = endTotalMinutes % 60;
  return `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
}
