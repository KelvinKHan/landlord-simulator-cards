/**
 * 天气系统 - 完整模块
 * 包含：天气生成算法、系统管理器、UI界面
 * 适配小手机系统和SillyTavern环境
 */

// ============ 第一部分：工具函数 ============

/**
 * 带种子的伪随机数生成器 (mulberry32)
 * 高质量 PRNG，分布均匀，周期 2^32
 */
function seededRandom(seed) {
  var s = seed | 0
  return function() {
    s = (s + 0x6D2B79F5) | 0
    var t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ============ 第二部分：天气生成器 ============

// 天气类型及其属性
var WEATHER_TYPES = {
  sunny: { name: '晴', icon: '☀️', svg: 'mdi:weather-sunny', category: 'clear', severity: 0 },
  partly_cloudy: { name: '多云', icon: '⛅', svg: 'mdi:weather-partly-cloudy', category: 'cloudy', severity: 1 },
  cloudy: { name: '阴', icon: '☁️', svg: 'mdi:weather-cloudy', category: 'cloudy', severity: 2 },
  overcast: { name: '阴沉', icon: '🌥️', svg: 'mdi:cloud', category: 'cloudy', severity: 3 },
  light_rain: { name: '小雨', icon: '🌧️', svg: 'mdi:weather-rainy', category: 'rain', severity: 4 },
  rain: { name: '中雨', icon: '🌧️', svg: 'mdi:weather-pouring', category: 'rain', severity: 5 },
  heavy_rain: { name: '大雨', icon: '⛈️', svg: 'mdi:weather-lightning-rainy', category: 'rain', severity: 6 },
  thunderstorm: { name: '雷雨', icon: '⛈️', svg: 'mdi:weather-lightning', category: 'storm', severity: 7 },
  light_snow: { name: '小雪', icon: '🌨️', svg: 'mdi:weather-snowy', category: 'snow', severity: 4 },
  snow: { name: '中雪', icon: '❄️', svg: 'mdi:snowflake', category: 'snow', severity: 5 },
  heavy_snow: { name: '大雪', icon: '❄️', svg: 'mdi:weather-snowy-heavy', category: 'snow', severity: 6 },
  fog: { name: '雾', icon: '🌫️', svg: 'mdi:weather-fog', category: 'fog', severity: 2 },
  haze: { name: '霾', icon: '😷', svg: 'mdi:weather-hazy', category: 'haze', severity: 3 }
}

// SVG天气图标渲染辅助函数（用于UI显示，替代emoji）
function weatherSvg(weatherType, size, color) {
  var info = WEATHER_TYPES[weatherType]
  if (!info || !info.svg) return info ? info.icon : '🌤️'
  var c = color || '%23ffffff'
  return '<img src="https://api.iconify.design/' + info.svg + '.svg?color=' + c + '" style="width:' + size + 'px;height:' + size + 'px;vertical-align:middle;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.25));">'
}

// Iconify图标辅助函数（非天气图标）
function iconSvg(name, size, color) {
  var c = color || '%23ffffff'
  return '<img src="https://api.iconify.design/' + name + '.svg?color=' + c + '" style="width:' + size + 'px;height:' + size + 'px;vertical-align:middle;">'
}

// 季节定义
var SEASONS = {
  spring: { months: [3, 4, 5], name: '春季', baseTemp: 16, tempRange: 10, dayNightDiff: 8 },
  summer: { months: [6, 7, 8], name: '夏季', baseTemp: 28, tempRange: 6, dayNightDiff: 7 },
  autumn: { months: [9, 10, 11], name: '秋季', baseTemp: 18, tempRange: 10, dayNightDiff: 9 },
  winter: { months: [12, 1, 2], name: '冬季', baseTemp: 6, tempRange: 7, dayNightDiff: 10 }
}

// 季节天气转换矩阵
var SPRING_TRANSITIONS = {
  sunny: { sunny: 35, partly_cloudy: 45, cloudy: 15, fog: 5 },
  partly_cloudy: { sunny: 25, partly_cloudy: 40, cloudy: 30, fog: 5 },
  cloudy: { sunny: 8, partly_cloudy: 22, cloudy: 35, overcast: 25, light_rain: 10 },
  overcast: { partly_cloudy: 10, cloudy: 30, overcast: 35, light_rain: 20, fog: 5 },
  light_rain: { cloudy: 15, overcast: 30, light_rain: 40, rain: 15 },
  rain: { overcast: 10, light_rain: 35, rain: 40, heavy_rain: 15 },
  heavy_rain: { light_rain: 20, rain: 45, heavy_rain: 35 },
  fog: { sunny: 30, partly_cloudy: 40, cloudy: 20, fog: 10 },
  haze: { partly_cloudy: 30, cloudy: 40, haze: 30 }
}

var SUMMER_TRANSITIONS = {
  sunny: { sunny: 45, partly_cloudy: 35, cloudy: 12, thunderstorm: 8 },
  partly_cloudy: { sunny: 25, partly_cloudy: 35, cloudy: 25, thunderstorm: 15 },
  cloudy: { sunny: 15, partly_cloudy: 30, cloudy: 30, overcast: 15, thunderstorm: 10 },
  overcast: { partly_cloudy: 15, cloudy: 30, overcast: 25, light_rain: 15, thunderstorm: 15 },
  light_rain: { cloudy: 20, overcast: 25, light_rain: 30, rain: 15, thunderstorm: 10 },
  rain: { overcast: 15, light_rain: 30, rain: 30, heavy_rain: 15, thunderstorm: 10 },
  heavy_rain: { rain: 35, heavy_rain: 35, thunderstorm: 30 },
  thunderstorm: { sunny: 25, partly_cloudy: 30, cloudy: 20, rain: 15, thunderstorm: 10 },
  fog: { sunny: 50, partly_cloudy: 40, fog: 10 },
  haze: { partly_cloudy: 40, cloudy: 30, haze: 30 }
}

var AUTUMN_TRANSITIONS = {
  sunny: { sunny: 65, partly_cloudy: 25, cloudy: 8, fog: 2 },
  partly_cloudy: { sunny: 35, partly_cloudy: 45, cloudy: 18, fog: 2 },
  cloudy: { sunny: 20, partly_cloudy: 35, cloudy: 35, overcast: 8, fog: 2 },
  overcast: { partly_cloudy: 20, cloudy: 40, overcast: 30, light_rain: 10 },
  light_rain: { cloudy: 25, overcast: 35, light_rain: 30, rain: 10 },
  rain: { overcast: 20, light_rain: 40, rain: 35, heavy_rain: 5 },
  heavy_rain: { light_rain: 30, rain: 50, heavy_rain: 20 },
  fog: { sunny: 40, partly_cloudy: 35, cloudy: 15, fog: 10 },
  haze: { partly_cloudy: 25, cloudy: 35, overcast: 15, haze: 25 }
}

var WINTER_TRANSITIONS = {
  sunny: { sunny: 45, partly_cloudy: 35, cloudy: 15, fog: 5 },
  partly_cloudy: { sunny: 25, partly_cloudy: 40, cloudy: 30, fog: 5 },
  cloudy: { sunny: 10, partly_cloudy: 25, cloudy: 40, overcast: 20, fog: 5 },
  overcast: { partly_cloudy: 8, cloudy: 30, overcast: 35, light_snow: 15, light_rain: 12 },
  light_rain: { cloudy: 20, overcast: 35, light_rain: 30, rain: 10, light_snow: 5 },
  rain: { overcast: 20, light_rain: 40, rain: 30, heavy_rain: 5, snow: 5 },
  heavy_rain: { light_rain: 25, rain: 45, heavy_rain: 20, snow: 10 },
  light_snow: { cloudy: 15, overcast: 30, light_snow: 40, snow: 15 },
  snow: { overcast: 15, light_snow: 35, snow: 40, heavy_snow: 10 },
  heavy_snow: { light_snow: 20, snow: 50, heavy_snow: 30 },
  fog: { sunny: 30, partly_cloudy: 30, cloudy: 25, fog: 15 },
  haze: { partly_cloudy: 20, cloudy: 35, overcast: 20, haze: 25 }
}

var SEASON_TRANSITIONS = {
  spring: SPRING_TRANSITIONS,
  summer: SUMMER_TRANSITIONS,
  autumn: AUTUMN_TRANSITIONS,
  winter: WINTER_TRANSITIONS
}

// 时段特征配置
var TIME_PERIOD_MODIFIERS = {
  dawn: { hours: [0, 2, 4], fogChance: 0.15, thunderstormChance: 0.02 },
  morning: { hours: [6, 8], fogChance: 0.08, thunderstormChance: 0.05 },
  midday: { hours: [10, 12], fogChance: 0.01, thunderstormChance: 0.10 },
  afternoon: { hours: [14, 16], fogChance: 0.01, thunderstormChance: 0.25 },
  evening: { hours: [18, 20], fogChance: 0.03, thunderstormChance: 0.08 },
  night: { hours: [22], fogChance: 0.10, thunderstormChance: 0.03 }
}

// 天气持续性配置
var WEATHER_PERSISTENCE = {
  sunny: { minDuration: 3, maxDuration: 24, stability: 0.85 },
  partly_cloudy: { minDuration: 2, maxDuration: 12, stability: 0.70 },
  cloudy: { minDuration: 2, maxDuration: 16, stability: 0.75 },
  overcast: { minDuration: 2, maxDuration: 10, stability: 0.70 },
  light_rain: { minDuration: 2, maxDuration: 14, stability: 0.65 },
  rain: { minDuration: 1, maxDuration: 8, stability: 0.60 },
  heavy_rain: { minDuration: 1, maxDuration: 4, stability: 0.50 },
  thunderstorm: { minDuration: 1, maxDuration: 3, stability: 0.40 },
  light_snow: { minDuration: 2, maxDuration: 16, stability: 0.70 },
  snow: { minDuration: 2, maxDuration: 10, stability: 0.65 },
  heavy_snow: { minDuration: 1, maxDuration: 6, stability: 0.55 },
  fog: { minDuration: 1, maxDuration: 6, stability: 0.50 },
  haze: { minDuration: 3, maxDuration: 12, stability: 0.75 }
}

// 温度曲线
var TEMP_CURVE = {
  0: 0.15, 2: 0.08, 4: 0.02, 6: 0.10, 8: 0.30, 10: 0.55,
  12: 0.80, 14: 1.00, 16: 0.95, 18: 0.75, 20: 0.50, 22: 0.30
}

// 天气对温度的影响
var WEATHER_TEMP_MODIFIERS = {
  sunny: { dayBonus: 3, nightBonus: -1 },
  partly_cloudy: { dayBonus: 1, nightBonus: 0 },
  cloudy: { dayBonus: -2, nightBonus: 2 },
  overcast: { dayBonus: -3, nightBonus: 3 },
  light_rain: { dayBonus: -5, nightBonus: 0 },
  rain: { dayBonus: -6, nightBonus: -1 },
  heavy_rain: { dayBonus: -8, nightBonus: -2 },
  thunderstorm: { dayBonus: -7, nightBonus: -3 },
  light_snow: { dayBonus: -4, nightBonus: -2 },
  snow: { dayBonus: -6, nightBonus: -3 },
  heavy_snow: { dayBonus: -8, nightBonus: -4 },
  fog: { dayBonus: -2, nightBonus: 2 },
  haze: { dayBonus: -1, nightBonus: 1 }
}

// ============ 工具函数 ============

function dateToSeed(year, month, day) {
  return year * 10000 + month * 100 + day
}

function getSeason(month) {
  for (var seasonKey in SEASONS) {
    var seasonData = SEASONS[seasonKey]
    if (seasonData.months.indexOf(month) !== -1) {
      return { key: seasonKey, name: seasonData.name, baseTemp: seasonData.baseTemp,
               tempRange: seasonData.tempRange, dayNightDiff: seasonData.dayNightDiff,
               months: seasonData.months }
    }
  }
  return { key: 'spring', name: SEASONS.spring.name, baseTemp: SEASONS.spring.baseTemp,
           tempRange: SEASONS.spring.tempRange, dayNightDiff: SEASONS.spring.dayNightDiff,
           months: SEASONS.spring.months }
}

function getTimePeriod(hour) {
  if (hour >= 0 && hour < 6) return 'dawn'
  if (hour >= 6 && hour < 10) return 'morning'
  if (hour >= 10 && hour < 14) return 'midday'
  if (hour >= 14 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 22) return 'evening'
  return 'night'
}

function weightedRandom(weights, random) {
  var entries = []
  for (var key in weights) {
    entries.push([key, weights[key]])
  }
  var totalWeight = 0
  for (var i = 0; i < entries.length; i++) {
    totalWeight += entries[i][1]
  }
  if (totalWeight === 0) return entries[0] ? entries[0][0] : 'sunny'

  var randomValue = random() * totalWeight
  var cumulative = 0
  for (var j = 0; j < entries.length; j++) {
    cumulative += entries[j][1]
    if (randomValue < cumulative) {
      return entries[j][0]
    }
  }
  return entries[0][0]
}

function getWeekdayName(dayIndex) {
  var names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return names[dayIndex]
}

function getSeasonInitialWeights(seasonKey) {
  var weights = {
    spring: { sunny: 25, partly_cloudy: 35, cloudy: 25, light_rain: 10, fog: 5 },
    summer: { sunny: 45, partly_cloudy: 30, cloudy: 15, thunderstorm: 10 },
    autumn: { sunny: 40, partly_cloudy: 35, cloudy: 20, fog: 5 },
    winter: { sunny: 20, partly_cloudy: 30, cloudy: 35, light_snow: 10, fog: 5 }
  }
  return weights[seasonKey] || weights.spring
}

// ============ 核心天气演变逻辑 ============

function evolveWeather(currentWeather, currentDuration, seasonKey, hour, random) {
  var persistence = WEATHER_PERSISTENCE[currentWeather] || WEATHER_PERSISTENCE.sunny
  var transitions = SEASON_TRANSITIONS[seasonKey] || SPRING_TRANSITIONS
  var period = getTimePeriod(hour)
  var periodMod = TIME_PERIOD_MODIFIERS[period]

  var changeChance = 1 - persistence.stability

  if (currentDuration >= persistence.minDuration) {
    var overTime = currentDuration - persistence.minDuration
    var maxOverTime = persistence.maxDuration - persistence.minDuration
    changeChance += (overTime / maxOverTime) * 0.5
  }

  if (currentDuration < persistence.minDuration) {
    changeChance *= 0.2
  }

  if (seasonKey === 'summer' && period === 'afternoon') {
    if (currentWeather === 'sunny' || currentWeather === 'partly_cloudy') {
      if (random() < periodMod.thunderstormChance) {
        return { weather: 'thunderstorm', duration: 1 }
      }
    }
  }

  if (period === 'dawn' && currentWeather !== 'fog' &&
      (currentWeather === 'cloudy' || currentWeather === 'partly_cloudy' || currentWeather === 'sunny')) {
    if (random() < periodMod.fogChance) {
      return { weather: 'fog', duration: 1 }
    }
  }

  if (period === 'morning' && currentWeather === 'fog' && currentDuration >= 2) {
    if (random() < 0.6) {
      return { weather: 'sunny', duration: 1 }
    }
  }

  if (random() > changeChance) {
    return { weather: currentWeather, duration: currentDuration + 1 }
  }

  var transitionWeights = transitions[currentWeather]
  if (!transitionWeights) {
    transitionWeights = { sunny: 30, partly_cloudy: 40, cloudy: 30 }
  }

  var filteredWeights = {}
  for (var weather in transitionWeights) {
    if (weather !== currentWeather) {
      filteredWeights[weather] = transitionWeights[weather]
    }
  }

  if (Object.keys(filteredWeights).length === 0) {
    return { weather: currentWeather, duration: currentDuration + 1 }
  }

  var newWeather = weightedRandom(filteredWeights, random)
  return { weather: newWeather, duration: 1 }
}

function generateContinuousWeatherStream(startYear, startMonth, startDay, initialWeather, totalSlots) {
  if (!totalSlots) totalSlots = 84

  var baseSeed = dateToSeed(startYear, startMonth, startDay)
  var random = seededRandom(baseSeed)

  var slots = []
  var startDate = new Date(startYear, startMonth - 1, startDay)

  var currentWeather = initialWeather
  var currentDuration = 1

  if (!currentWeather) {
    var season = getSeason(startMonth)
    var seasonWeights = getSeasonInitialWeights(season.key)
    currentWeather = weightedRandom(seasonWeights, random)
  }

  for (var slotIndex = 0; slotIndex < totalSlots; slotIndex++) {
    var slotDate = new Date(startDate.getTime() + slotIndex * 2 * 60 * 60 * 1000)
    var year = slotDate.getFullYear()
    var month = slotDate.getMonth() + 1
    var day = slotDate.getDate()
    var hour = slotDate.getHours()

    var season = getSeason(month)

    var slotSeed = baseSeed * 100 + slotIndex
    var slotRandom = seededRandom(slotSeed)

    slots.push({
      slotIndex: slotIndex,
      year: year,
      month: month,
      day: day,
      hour: hour,
      weather: currentWeather,
      season: season.key
    })

    var evolved = evolveWeather(currentWeather, currentDuration, season.key, hour, slotRandom)

    if (evolved.weather === currentWeather) {
      currentDuration = evolved.duration
    } else {
      currentWeather = evolved.weather
      currentDuration = 1
    }
  }

  return slots
}

function aggregateToDaily(slots) {
  var dailyMap = {}

  for (var i = 0; i < slots.length; i++) {
    var slot = slots[i]
    var dateKey = slot.year + '-' + slot.month + '-' + slot.day

    if (!dailyMap[dateKey]) {
      dailyMap[dateKey] = {
        year: slot.year,
        month: slot.month,
        day: slot.day,
        date: String(slot.month).padStart(2, '0') + '-' + String(slot.day).padStart(2, '0'),
        weekday: getWeekdayName(new Date(slot.year, slot.month - 1, slot.day).getDay()),
        slots: [],
        weatherCounts: {},
        season: slot.season
      }
    }

    var dayData = dailyMap[dateKey]
    dayData.slots.push(slot)
    dayData.weatherCounts[slot.weather] = (dayData.weatherCounts[slot.weather] || 0) + 1
  }

  var dailyList = []
  for (var key in dailyMap) {
    var dayData = dailyMap[key]

    var dominantWeather = 'sunny'
    var maxCount = 0
    for (var weather in dayData.weatherCounts) {
      if (dayData.weatherCounts[weather] > maxCount) {
        maxCount = dayData.weatherCounts[weather]
        dominantWeather = weather
      }
    }

    var weatherInfo = WEATHER_TYPES[dominantWeather] || WEATHER_TYPES.sunny

    var hourly = []
    for (var j = 0; j < dayData.slots.length; j++) {
      var slot = dayData.slots[j]
      var slotWeatherInfo = WEATHER_TYPES[slot.weather] || WEATHER_TYPES.sunny
      hourly.push({
        time: String(slot.hour).padStart(2, '0') + ':00',
        weather: slot.weather,
        weatherName: slotWeatherInfo.name,
        icon: slotWeatherInfo.icon,
        temp: 0
      })
    }

    dailyList.push({
      date: dayData.date,
      year: dayData.year,
      month: dayData.month,
      day: dayData.day,
      weekday: dayData.weekday,
      weather: dominantWeather,
      weatherName: weatherInfo.name,
      icon: weatherInfo.icon,
      category: weatherInfo.category,
      tempHigh: 0,
      tempLow: 0,
      hourly: hourly,
      season: dayData.season
    })
  }

  dailyList.sort(function(a, b) {
    if (a.year !== b.year) return a.year - b.year
    if (a.month !== b.month) return a.month - b.month
    return a.day - b.day
  })

  return dailyList
}

// ============ 温度生成系统 ============

function generateTemperatures(dailyForecast, startYear, startMonth, startDay) {
  var baseSeed = dateToSeed(startYear, startMonth, startDay)
  var prevDayAvgTemp = null

  for (var dayIndex = 0; dayIndex < dailyForecast.length; dayIndex++) {
    var dayData = dailyForecast[dayIndex]
    var season = SEASONS[dayData.season] || SEASONS.spring

    var daySeed = baseSeed + dayIndex * 1000
    var random = seededRandom(daySeed)

    var baseTemp = season.baseTemp + (random() - 0.5) * season.tempRange

    if (prevDayAvgTemp !== null) {
      var maxChange = 5
      baseTemp = Math.max(prevDayAvgTemp - maxChange, Math.min(prevDayAvgTemp + maxChange, baseTemp))
    }

    var weatherMod = WEATHER_TEMP_MODIFIERS[dayData.weather] || { dayBonus: 0, nightBonus: 0 }
    var avgWeatherMod = (weatherMod.dayBonus + weatherMod.nightBonus) / 2
    baseTemp += avgWeatherMod

    var dayNightDiff = season.dayNightDiff

    var tempHigh = Math.round(baseTemp + dayNightDiff / 2)
    var tempLow = Math.round(baseTemp - dayNightDiff / 2)

    dayData.tempHigh = tempHigh
    dayData.tempLow = tempLow

    if (dayData.hourly) {
      for (var h = 0; h < dayData.hourly.length; h++) {
        var hourData = dayData.hourly[h]
        var hour = parseInt(hourData.time.split(':')[0])
        var curve = TEMP_CURVE[hour] !== undefined ? TEMP_CURVE[hour] : 0.5

        var temp = tempLow + (tempHigh - tempLow) * curve

        var hourWeatherMod = WEATHER_TEMP_MODIFIERS[hourData.weather] || { dayBonus: 0, nightBonus: 0 }
        var isDay = hour >= 6 && hour < 18
        temp += isDay ? hourWeatherMod.dayBonus * 0.3 : hourWeatherMod.nightBonus * 0.3

        hourData.temp = Math.round(temp)
      }
    }

    prevDayAvgTemp = baseTemp
  }
}

// ============ 对外接口函数 ============

function generateWeatherForecast(year, month, day, currentWeather, lastWeatherOfPreviousDay) {
  var initialWeather = lastWeatherOfPreviousDay || currentWeather

  var weatherStream = generateContinuousWeatherStream(year, month, day, initialWeather, 84)

  var dailyForecast = aggregateToDaily(weatherStream)

  generateTemperatures(dailyForecast, year, month, day)

  var season = getSeason(month)

  var currentHour = new Date().getHours()
  var timePoint = Math.floor(currentHour / 2) * 2
  var timeStr = String(timePoint).padStart(2, '0') + ':00'

  var currentTemp = Math.round((dailyForecast[0].tempHigh + dailyForecast[0].tempLow) / 2)
  var currentWeatherName = dailyForecast[0].weatherName
  var currentIcon = dailyForecast[0].icon
  var currentWeatherType = dailyForecast[0].weather

  if (dailyForecast[0].hourly) {
    for (var i = 0; i < dailyForecast[0].hourly.length; i++) {
      var h = dailyForecast[0].hourly[i]
      if (h.time === timeStr) {
        currentTemp = h.temp
        currentWeatherName = h.weatherName
        currentIcon = h.icon
        currentWeatherType = h.weather
        break
      }
    }
  }

  return {
    current: {
      weather: currentWeatherType,
      weatherName: currentWeatherName,
      icon: currentIcon,
      temperature: currentTemp,
      tempHigh: dailyForecast[0].tempHigh,
      tempLow: dailyForecast[0].tempLow
    },
    forecast: dailyForecast,
    lastUpdateDate: year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0'),
    season: season.key
  }
}

function getCurrentWeatherAtHour(weatherData, hour) {
  if (!weatherData || !weatherData.forecast || weatherData.forecast.length === 0) {
    return null
  }

  var today = weatherData.forecast[0]
  if (!today.hourly || today.hourly.length === 0) {
    return {
      weather: today.weather,
      weatherName: today.weatherName,
      icon: today.icon,
      temp: Math.round((today.tempHigh + today.tempLow) / 2)
    }
  }

  var timePoint = Math.floor(hour / 2) * 2
  var timeStr = String(timePoint).padStart(2, '0') + ':00'

  for (var i = 0; i < today.hourly.length; i++) {
    var h = today.hourly[i]
    if (h.time === timeStr) {
      return {
        weather: h.weather,
        weatherName: h.weatherName,
        icon: h.icon,
        temp: h.temp
      }
    }
  }

  return {
    weather: today.weather,
    weatherName: today.weatherName,
    icon: today.icon,
    temp: Math.round((today.tempHigh + today.tempLow) / 2)
  }
}

function detectWeatherChange(weatherData, previousHour, currentHour) {
  if (!weatherData || !weatherData.forecast || weatherData.forecast.length === 0) {
    return null
  }

  var today = weatherData.forecast[0]
  if (!today.hourly || today.hourly.length === 0) {
    return null
  }

  var prevTimePoint = Math.floor(previousHour / 2) * 2
  var currTimePoint = Math.floor(currentHour / 2) * 2

  if (prevTimePoint === currTimePoint) {
    return null
  }

  var prevTimeStr = String(prevTimePoint).padStart(2, '0') + ':00'
  var currTimeStr = String(currTimePoint).padStart(2, '0') + ':00'

  var prevHourly = null
  var currHourly = null

  for (var i = 0; i < today.hourly.length; i++) {
    if (today.hourly[i].time === prevTimeStr) prevHourly = today.hourly[i]
    if (today.hourly[i].time === currTimeStr) currHourly = today.hourly[i]
  }

  if (!prevHourly || !currHourly) {
    return null
  }

  if (prevHourly.weather !== currHourly.weather) {
    return {
      fromWeather: prevHourly.weatherName,
      toWeather: currHourly.weatherName,
      fromIcon: prevHourly.icon,
      toIcon: currHourly.icon,
      reason: generateWeatherChangeReason(prevHourly.weather, currHourly.weather)
    }
  }

  return null
}

function generateWeatherChangeReason(fromWeather, toWeather) {
  var fromInfo = WEATHER_TYPES[fromWeather]
  var toInfo = WEATHER_TYPES[toWeather]

  if (toWeather === 'sunny') {
    if (fromInfo && fromInfo.category === 'rain') {
      return '雨过天晴，阳光洒落'
    } else if (fromInfo && fromInfo.category === 'cloudy') {
      return '云层散开，天空放晴'
    } else if (fromWeather === 'fog') {
      return '晨雾散去，阳光明媚'
    } else if (fromWeather === 'thunderstorm') {
      return '雷雨过后，天空放晴'
    }
    return '天气转晴'
  }

  if (toWeather === 'partly_cloudy') {
    if (fromWeather === 'sunny') {
      return '天边飘来几朵云彩'
    } else if (fromInfo && fromInfo.category === 'rain') {
      return '雨势渐停，云层变薄'
    }
    return '天空变得多云'
  }

  if (toInfo && toInfo.category === 'cloudy') {
    if (fromWeather === 'sunny' || fromWeather === 'partly_cloudy') {
      return '云层逐渐聚集，遮住了阳光'
    } else if (fromInfo && fromInfo.category === 'rain') {
      return '雨势渐停，但天空仍然阴沉'
    }
    return '天空变得阴沉'
  }

  if (toInfo && toInfo.category === 'rain') {
    if (toWeather === 'light_rain') {
      return '天空开始飘起细雨'
    } else if (toWeather === 'rain') {
      return '雨势逐渐加大'
    } else if (toWeather === 'heavy_rain') {
      return '倾盆大雨从天而降'
    }
    return '开始下雨'
  }

  if (toWeather === 'thunderstorm') {
    return '乌云密布，雷声隆隆，暴风雨即将来临'
  }

  if (toInfo && toInfo.category === 'snow') {
    if (toWeather === 'light_snow') {
      return '天空飘起了雪花'
    } else if (toWeather === 'snow') {
      return '雪越下越大'
    } else if (toWeather === 'heavy_snow') {
      return '漫天大雪纷飞'
    }
    return '开始下雪'
  }

  if (toWeather === 'fog') {
    return '雾气弥漫，能见度下降'
  }

  if (toWeather === 'haze') {
    return '空气质量下降，天空灰蒙蒙的'
  }

  return '天气从' + (fromInfo ? fromInfo.name : fromWeather) + '变为' + (toInfo ? toInfo.name : toWeather)
}

function getWeatherGradient(weatherType) {
  var gradients = {
    sunny: 'linear-gradient(135deg, #56CCF2 0%, #2F80ED 100%)',
    partly_cloudy: 'linear-gradient(135deg, #89CFF0 0%, #5DADE2 100%)',
    cloudy: 'linear-gradient(135deg, #8E9EAB 0%, #B8C6DB 100%)',
    overcast: 'linear-gradient(135deg, #636e72 0%, #b2bec3 100%)',
    light_rain: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    rain: 'linear-gradient(135deg, #4B6CB7 0%, #182848 100%)',
    heavy_rain: 'linear-gradient(135deg, #1F1C2C 0%, #928DAB 100%)',
    thunderstorm: 'linear-gradient(135deg, #232526 0%, #414345 100%)',
    light_snow: 'linear-gradient(135deg, #E6DADA 0%, #274046 100%)',
    snow: 'linear-gradient(135deg, #D7DDE8 0%, #757F9A 100%)',
    heavy_snow: 'linear-gradient(135deg, #E8E8E8 0%, #5C5C5C 100%)',
    fog: 'linear-gradient(135deg, #B6BDBD 0%, #8A9A9A 100%)',
    haze: 'linear-gradient(135deg, #948E99 0%, #2E1437 100%)'
  }
  return gradients[weatherType] || gradients.sunny
}

// ============ 第三部分：天气系统管理器 ============

var WeatherSystem = {
  data: {
    current: {
      weather: 'sunny',
      weatherName: '晴',
      icon: '☀️',
      temperature: 22,
      tempHigh: 25,
      tempLow: 18
    },
    forecast: [],
    lastUpdateDate: null,
    season: 'spring',
    previousHour: null,
    lastChangeInfo: null
  },
  isLoading: false,
  lastKnownDate: null,
  lastKnownHour: null,
  uninject: null,

  // 获取当前聊天ID
  getChatId: function() {
    try {
      var ctx = window.parent.SillyTavern && window.parent.SillyTavern.getContext && window.parent.SillyTavern.getContext()
      if (!ctx) {
        console.warn('[天气系统] 无法获取SillyTavern上下文')
        return 'default'
      }

      if (typeof ctx.getCurrentChatId === 'function') {
        var chatId = ctx.getCurrentChatId()
        if (chatId) return String(chatId)
      }

      if (ctx.chatId) {
        return String(ctx.chatId)
      }

      if (ctx.characterId !== undefined && ctx.characters && ctx.characters[ctx.characterId]) {
        var charChat = ctx.characters[ctx.characterId].chat
        if (charChat) return String(charChat)
      }

      return 'default'
    } catch (e) {
      console.error('[天气系统] 获取chatId失败:', e)
      return 'default'
    }
  },

  // 获取存储key
  getStorageKey: function(suffix) {
    return 'phone_weather_' + this.getChatId() + '_' + suffix
  },

  // 从MVU获取游戏日期
  getCurrentGameDate: function() {
    try {
      var mvu = landlord.readState().世界
      if (mvu && mvu.日期 && mvu.年份) {
        var dateStr = mvu.日期
        var yearStr = mvu.年份

        var match = dateStr.match(/(\d+)月(\d+)日/)
        if (match) {
          var month = parseInt(match[1])
          var day = parseInt(match[2])
          var year = parseInt(yearStr)

          return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
        }
      }

      // 回退方案：从消息中提取
      var extracted = this.extractFromMessageText()
      if (extracted && extracted.世界 && extracted.世界.日期 && extracted.世界.年份) {
        var dateStr = extracted.世界.日期
        var yearStr = extracted.世界.年份

        var match = dateStr.match(/(\d+)月(\d+)日/)
        if (match) {
          var month = parseInt(match[1])
          var day = parseInt(match[2])
          var year = parseInt(yearStr)

          return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
        }
      }

      return null
    } catch (e) {
      console.error('[天气系统] 获取游戏日期失败:', e)
      return null
    }
  },

  // 从MVU获取游戏小时
  getCurrentGameHour: function() {
    try {
      var mvu = landlord.readState().世界
      if (mvu && mvu.时间) {
        var timeStr = mvu.时间
        var match = timeStr.match(/(\d+):(\d+)/)
        if (match) {
          return parseInt(match[1])
        }
      }

      // 回退方案
      var extracted = this.extractFromMessageText()
      if (extracted && extracted.世界 && extracted.世界.时间) {
        var timeStr = extracted.世界.时间
        var match = timeStr.match(/(\d+):(\d+)/)
        if (match) {
          return parseInt(match[1])
        }
      }

      return 0
    } catch (e) {
      console.error('[天气系统] 获取游戏小时失败:', e)
      return 0
    }
  },

  // 从消息文本中提取JSONPatch数据（回退方案）
  extractFromMessageText: function() {
    try {
      var ctx = window.parent.SillyTavern && window.parent.SillyTavern.getContext && window.parent.SillyTavern.getContext()
      if (!ctx || !ctx.chat || !Array.isArray(ctx.chat)) return null

      for (var i = ctx.chat.length - 1; i >= 0; i--) {
        var msg = ctx.chat[i]
        if (msg && msg.mes) {
          var jsonPatchMatch = msg.mes.match(/<JSONPatch>\s*(\[[\s\S]*?\])\s*<\/JSONPatch>/)
          if (jsonPatchMatch) {
            try {
              var patches = JSON.parse(jsonPatchMatch[1])
              var extracted = { 世界: {} }

              for (var j = 0; j < patches.length; j++) {
                var patch = patches[j]
                if (patch.path && patch.value !== undefined) {
                  if (patch.path === '/世界/日期') extracted.世界.日期 = patch.value
                  if (patch.path === '/世界/年份') extracted.世界.年份 = patch.value
                  if (patch.path === '/世界/时间') extracted.世界.时间 = patch.value
                }
              }

              if (extracted.世界.日期 || extracted.世界.年份 || extracted.世界.时间) {
                return extracted
              }
            } catch (e) {
              continue
            }
          }
        }
      }
      return null
    } catch (e) {
      console.error('[天气系统] 提取消息数据失败:', e)
      return null
    }
  },

  // 更新天气预报
  updateWeatherForecast: function() {
    var currentDateStr = this.getCurrentGameDate()
    if (!currentDateStr) {
      console.warn('[天气系统] 无法获取当前日期')
      return
    }

    // 如果日期相同且数据已存在，跳过更新
    if (this.data.lastUpdateDate === currentDateStr &&
        this.data.forecast && this.data.forecast.length > 0) {
      return
    }

    console.log('[天气系统] 更新天气预报:', currentDateStr)

    var parts = currentDateStr.split('-')
    var year = parseInt(parts[0])
    var month = parseInt(parts[1])
    var day = parseInt(parts[2])

    var previousWeather = null
    var lastWeatherOfPreviousDay = null

    if (this.data.forecast.length > 0) {
      for (var i = 0; i < this.data.forecast.length; i++) {
        var f = this.data.forecast[i]
        if (f.year === year && f.month === month && f.day === day) {
          previousWeather = f.weather
          break
        }
      }

      var yesterdayDate = new Date(year, month - 1, day - 1)
      var yYear = yesterdayDate.getFullYear()
      var yMonth = yesterdayDate.getMonth() + 1
      var yDay = yesterdayDate.getDate()

      for (var j = 0; j < this.data.forecast.length; j++) {
        var yf = this.data.forecast[j]
        if (yf.year === yYear && yf.month === yMonth && yf.day === yDay) {
          if (yf.hourly && yf.hourly.length > 0) {
            lastWeatherOfPreviousDay = yf.hourly[yf.hourly.length - 1].weather
          } else {
            lastWeatherOfPreviousDay = yf.weather
          }
          break
        }
      }
    }

    if (!lastWeatherOfPreviousDay && !previousWeather) {
      lastWeatherOfPreviousDay = this.data.current.weather || null
    }

    var weatherData = generateWeatherForecast(year, month, day, previousWeather, lastWeatherOfPreviousDay)

    this.data.current = weatherData.current
    this.data.forecast = weatherData.forecast
    this.data.lastUpdateDate = currentDateStr
    this.data.season = weatherData.season
    this.data.previousHour = this.getCurrentGameHour()
    this.data.lastChangeInfo = null

    // 保存到localStorage
    try {
      localStorage.setItem(this.getStorageKey('data'), JSON.stringify(this.data))
    } catch (e) {
      console.error('[天气系统] 保存数据失败:', e)
    }

    // 触发事件
    if (window.parent.eventBus) {
      window.parent.eventBus.emit('weather-updated', this.data)
    }

    console.log('[天气系统] 天气更新完成:', this.data.current.weatherName)
  },

  // 更新当前时刻天气
  updateCurrentWeather: function() {
    var hour = this.getCurrentGameHour()

    if (!this.data.forecast || this.data.forecast.length === 0) {
      return
    }

    var currentWeatherInfo = getCurrentWeatherAtHour(this.data, hour)
    if (currentWeatherInfo) {
      this.data.current = {
        weather: currentWeatherInfo.weather,
        weatherName: currentWeatherInfo.weatherName,
        icon: currentWeatherInfo.icon,
        temperature: currentWeatherInfo.temp,
        tempHigh: this.data.forecast[0].tempHigh,
        tempLow: this.data.forecast[0].tempLow
      }
    }
  },

  // 检测天气变化
  checkWeatherChange: function() {
    var hour = this.getCurrentGameHour()
    var previousHour = this.data.previousHour

    if (previousHour === hour) {
      return
    }

    var changeInfo = detectWeatherChange(this.data, previousHour, hour)

    this.data.previousHour = hour

    if (changeInfo) {
      this.data.lastChangeInfo = changeInfo
      console.log('[天气系统] 天气变化:', changeInfo.reason)
    } else {
      this.data.lastChangeInfo = null
    }
  },

  // 注入天气到系统提示词
  injectWeatherToSystem: function() {
    var self = this

    // 构建天气提示词
    var lines = []
    lines.push('[当前天气]')
    lines.push('天气：' + self.data.current.icon + ' ' + self.data.current.weatherName)
    lines.push('温度：' + self.data.current.temperature + '°C（最高' + self.data.current.tempHigh + '°C，最低' + self.data.current.tempLow + '°C）')
    lines.push('季节：' + (SEASONS[self.data.season] ? SEASONS[self.data.season].name : '春季'))

    var mvu = landlord.readState().世界
    if (mvu && mvu.时间) {
      lines.push('时间：' + mvu.时间)
    }

    if (self.data.lastChangeInfo) {
      lines.push('')
      lines.push('[天气变化]')
      lines.push(self.data.lastChangeInfo.reason + '（从' + self.data.lastChangeInfo.fromIcon + self.data.lastChangeInfo.fromWeather + '转为' + self.data.lastChangeInfo.toIcon + self.data.lastChangeInfo.toWeather + '）')
    }

    if (self.data.forecast.length > 0) {
      lines.push('')
      lines.push('[未来天气]')

      var today = self.data.forecast[0]
      if (today.hourly) {
        var currentHour = self.getCurrentGameHour()
        var count = 0
        for (var i = 0; i < today.hourly.length && count < 3; i++) {
          var h = today.hourly[i]
          var hNum = parseInt(h.time.split(':')[0])
          if (hNum > currentHour) {
            lines.push('今天' + h.time + '：' + h.weatherName + '，' + h.temp + '°C')
            count++
          }
        }
      }

      if (self.data.forecast.length > 1) {
        var tomorrow = self.data.forecast[1]
        lines.push('明天：' + tomorrow.weatherName + '，' + tomorrow.tempLow + '-' + tomorrow.tempHigh + '°C')
      }

      if (self.data.forecast.length > 2) {
        var dayAfter = self.data.forecast[2]
        lines.push('后天：' + dayAfter.weatherName + '，' + dayAfter.tempLow + '-' + dayAfter.tempHigh + '°C')
      }
    }

    var weatherContent = lines.join('\n')

    // 保存到变量
    try {
      var command = '/setvar key=phone_weather ' + weatherContent
      if (window.parent.executeSlashCommands) {
        window.parent.executeSlashCommands(command)
      } else if (window.parent.SillyTavern && window.parent.SillyTavern.getContext) {
        var context = window.parent.SillyTavern.getContext()
        if (context.executeSlashCommands) {
          context.executeSlashCommands(command)
        }
      }
      console.log('[天气系统] 天气信息已保存到变量')
    } catch (e) {
      console.error('[天气系统] 保存变量失败:', e)
    }
  },

  // 加载当前聊天的天气数据
  loadWeatherForCurrentChat: function() {
    try {
      var savedData = localStorage.getItem(this.getStorageKey('data'))
      if (savedData) {
        this.data = JSON.parse(savedData)
        console.log('[天气系统] 加载聊天天气数据成功')
      }
    } catch (e) {
      console.error('[天气系统] 加载天气数据失败:', e)
    }
  },

  // 检查日期和生成天气
  checkDateAndGenerate: function() {
    var currentDate = this.getCurrentGameDate()
    if (!currentDate) return  // 游戏未开始，直接返回

    // 如果日期变化，或者有日期但数据为空，则生成天气
    var needGenerate = (this.lastKnownDate !== currentDate) ||
                       (!this.data.forecast || this.data.forecast.length === 0)

    if (needGenerate) {
      if (this.lastKnownDate !== currentDate) {
        console.log('[天气系统] 检测到日期变化:', this.lastKnownDate, '->', currentDate)
      }
      this.lastKnownDate = currentDate
      this.updateWeatherForecast()
      this.updateCurrentWeather()
      this.injectWeatherToSystem()
    }
  },

  // 检查小时和更新天气
  checkHourAndUpdate: function() {
    var currentHour = this.getCurrentGameHour()

    if (this.lastKnownHour !== currentHour) {
      console.log('[天气系统] 检测到小时变化:', this.lastKnownHour, '->', currentHour)
      this.lastKnownHour = currentHour
      this.updateCurrentWeather()
      this.checkWeatherChange()
      this.injectWeatherToSystem()
    }
  },

  // 启动天气系统
  start: function() {
    var self = this
    console.log('[天气系统] 启动中...')

    // 加载当前聊天的数据
    self.loadWeatherForCurrentChat()

    // 初始化日期和小时
    self.lastKnownDate = self.getCurrentGameDate()
    self.lastKnownHour = self.getCurrentGameHour()

    // 生成初始天气
    self.checkDateAndGenerate()

    // 防抖函数
    var debounceTimer = null
    function debouncedCheck() {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(function() {
        self.checkDateAndGenerate()
        self.checkHourAndUpdate()
      }, 500)
    }

    // 监听消息事件
    if (window.parent && window.parent.eventSource) {
      window.parent.eventSource.on('message_received', debouncedCheck)
      window.parent.eventSource.on('message_sent', debouncedCheck)
      console.log('[天气系统] 已绑定消息事件监听')
    }

    // 监听聊天切换
    if (window.parent && window.parent.eventSource) {
      window.parent.eventSource.on('chat_id_changed', function() {
        console.log('[天气系统] 聊天切换，重新加载数据')
        self.loadWeatherForCurrentChat()
        self.checkDateAndGenerate()
      })

      window.parent.eventSource.on('chatLoaded', function() {
        console.log('[天气系统] 聊天加载完成')
        self.loadWeatherForCurrentChat()
        self.checkDateAndGenerate()
      })
    }

    // 定时检查（每30秒）
    setInterval(function() {
      self.checkDateAndGenerate()
      self.checkHourAndUpdate()
    }, 30000)

    console.log('[天气系统] 启动完成')
  }
}

// ============ 第四部分：天气APP UI ============

var WeatherGenerator = {
  WEATHER_TYPES: WEATHER_TYPES,
  SEASONS: SEASONS,
  generateWeatherForecast: generateWeatherForecast,
  getCurrentWeatherAtHour: getCurrentWeatherAtHour,
  detectWeatherChange: detectWeatherChange,
  getWeatherGradient: getWeatherGradient
}

function renderWeatherApp(container) {
  // 兼容处理：确保能访问到正确的 WeatherSystem（可能在 iframe 内执行）
  var ws = (typeof WeatherSystem !== 'undefined') ? WeatherSystem : (window.parent && window.parent.PhoneSystem && window.parent.PhoneSystem.weatherSystem)
  if (!ws) {
    console.error('[天气APP] 无法访问 WeatherSystem')
    container.innerHTML = '<div style="padding:20px;text-align:center;color:#fff;">天气系统未加载</div>'
    return
  }

  // 尝试更新数据（确保打开APP时数据是最新的）
  if (typeof ws.checkDateAndGenerate === 'function') ws.checkDateAndGenerate()
  if (typeof ws.checkHourAndUpdate === 'function') ws.checkHourAndUpdate()

  var data = ws.data
  console.log('[天气APP] 渲染数据:', data && data.forecast ? data.forecast.length + '天预报' : '无数据')

  if (!data || !data.forecast || data.forecast.length === 0) {
    container.innerHTML = '<div style="height:100%;padding-top:44px;box-sizing:border-box;background:linear-gradient(180deg,#4A90D9 0%,#67B8DE 50%,#89CFF0 100%);color:white;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;flex-direction:column;">'
      + '<div style="display:flex;align-items:center;padding:12px 16px;">'
      + '<div onclick="goHome()" style="cursor:pointer;display:flex;align-items:center;gap:4px;font-size:15px;opacity:0.9;">'
      + '<img src="https://api.iconify.design/ri:arrow-left-s-line.svg?color=white" style="width:24px;height:24px;">'
      + '<span>返回</span></div>'
      + '<div style="flex:1;text-align:center;font-size:17px;font-weight:600;">天气</div>'
      + '<div style="width:60px;"></div></div>'
      + '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;text-align:center;">'
      + '<div style="margin-bottom:24px;opacity:0.8;">' + weatherSvg('sunny', 80, '%2356CCF2') + '</div>'
      + '<div style="font-size:18px;font-weight:600;margin-bottom:12px;">暂无天气数据</div>'
      + '<div style="font-size:14px;opacity:0.7;line-height:1.6;">开始游戏后即可查看天气预报</div>'
      + '</div></div>'
    return
  }

  var currentWeather = data.current
  var forecast = data.forecast
  var season = data.season

  var backgroundGradient = getWeatherGradient(currentWeather.weather)
  var seasonName = SEASONS[season] ? SEASONS[season].name : '春季'

  // 构建逐时预报（从当前时间开始）
  var currentHour = ws.getCurrentGameHour()
  var currentTimePoint = Math.floor(currentHour / 2) * 2
  var combinedHourly = []

  // 今天剩余时间
  if (forecast[0] && forecast[0].hourly) {
    for (var i = 0; i < forecast[0].hourly.length; i++) {
      var h = forecast[0].hourly[i]
      var hourNum = parseInt(h.time.split(':')[0])
      if (hourNum >= currentTimePoint) {
        combinedHourly.push({
          time: h.time,
          weather: h.weather,
          icon: h.icon,
          temp: h.temp,
          isCurrent: hourNum === currentTimePoint,
          isNextDay: false,
          dayLabel: '',
          showDayLabel: false
        })
      }
    }
  }

  // 明天
  if (forecast[1] && forecast[1].hourly) {
    for (var j = 0; j < forecast[1].hourly.length; j++) {
      var h2 = forecast[1].hourly[j]
      combinedHourly.push({
        time: h2.time,
        weather: h2.weather,
        icon: h2.icon,
        temp: h2.temp,
        isCurrent: false,
        isNextDay: true,
        dayLabel: '明天',
        showDayLabel: j === 0
      })
    }
  }

  // 构建HTML
  var html = '<div class="weather-app-container" style="height: 100%; overflow-y: auto; padding-top: 44px; box-sizing: border-box; background: ' + backgroundGradient + '; color: white; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">'

  // 顶部导航栏（返回按钮）
  html += '<div style="display:flex;align-items:center;padding:12px 16px;position:relative;z-index:10;">'
  html += '<div onclick="goHome()" style="cursor:pointer;display:flex;align-items:center;gap:4px;font-size:15px;opacity:0.9;">'
  html += '<img src="https://api.iconify.design/ri:arrow-left-s-line.svg?color=white" style="width:24px;height:24px;">'
  html += '<span>返回</span>'
  html += '</div>'
  html += '<div style="flex:1;text-align:center;font-size:17px;font-weight:600;">天气</div>'
  html += '<div style="width:60px;"></div>'
  html += '</div>'

  // 头部 - 当前天气
  html += '<div style="text-align: center; padding: 20px; background: rgba(255,255,255,0.12); margin: 16px; border-radius: 24px; backdrop-filter: blur(15px); border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 8px 32px rgba(0,0,0,0.1); position: relative;">'

  // 季节标签
  var seasonColors = {
    spring: 'background: rgba(144,238,144,0.3); color: #c8ffc8; border-color: rgba(144,238,144,0.4);',
    summer: 'background: rgba(255,165,0,0.3); color: #ffe0a0; border-color: rgba(255,165,0,0.4);',
    autumn: 'background: rgba(210,105,30,0.3); color: #ffc080; border-color: rgba(210,105,30,0.4);',
    winter: 'background: rgba(135,206,235,0.3); color: #c0e8ff; border-color: rgba(135,206,235,0.4);'
  }
  var seasonStyle = seasonColors[season] || seasonColors.spring
  html += '<div style="position: absolute; top: 16px; right: 16px; padding: 6px 14px; border-radius: 16px; font-size: 12px; font-weight: 600; letter-spacing: 1px; backdrop-filter: blur(8px); border: 1px solid; ' + seasonStyle + '">' + seasonName + '</div>'

  html += '<div style="display: flex; align-items: center; justify-content: center; gap: 24px;">'
  html += '<div style="line-height: 1;">' + weatherSvg(currentWeather.weather, 72) + '</div>'
  html += '<div style="text-align: left;">'
  html += '<div style="font-size: 60px; font-weight: 100; line-height: 1; text-shadow: 0 4px 16px rgba(0,0,0,0.3); letter-spacing: -3px;">' + currentWeather.temperature + '°</div>'
  html += '<div style="font-size: 17px; opacity: 0.95; margin-top: 8px; font-weight: 500; letter-spacing: 2px;">' + currentWeather.weatherName + '</div>'
  html += '<div style="display: flex; gap: 16px; font-size: 14px; opacity: 0.9; margin-top: 8px;">'
  html += '<span style="color: #ffb3b3; font-weight: 500;">↑' + currentWeather.tempHigh + '°</span>'
  html += '<span style="color: #b3d4ff; font-weight: 500;">↓' + currentWeather.tempLow + '°</span>'
  html += '</div></div></div>'

  // 逐时预报
  if (combinedHourly.length > 0) {
    html += '<div style="background: rgba(255,255,255,0.12); border-radius: 20px; padding: 16px; margin: 0 16px 16px 16px; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.08);">'
    html += '<div style="display: flex; align-items: center; gap: 8px; font-size: 14px; opacity: 0.9; margin-bottom: 14px; font-weight: 600; letter-spacing: 0.5px;"><span>' + iconSvg('mdi:clock-outline', 16) + '</span>逐时预报</div>'
    html += '<div class="hourly-scroll-container" style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 8px; scroll-behavior: smooth; cursor: grab; user-select: none; -webkit-overflow-scrolling: touch;">'

    for (var k = 0; k < combinedHourly.length; k++) {
      var hour = combinedHourly[k]
      var hourNum = parseInt(hour.time.split(':')[0])
      var timeLabel = hourNum + '时'
      var currentClass = hour.isCurrent ? 'background: rgba(255,255,255,0.25); border-color: rgba(255,255,255,0.3); box-shadow: 0 4px 16px rgba(255,255,255,0.15);' : 'background: rgba(255,255,255,0.06);'

      html += '<div style="display: flex; flex-direction: column; align-items: center; min-width: 56px; padding: 12px 8px; border-radius: 18px; transition: all 0.3s ease; border: 1px solid transparent; position: relative; margin-top: 20px; ' + currentClass + '">'

      if (hour.showDayLabel) {
        html += '<div style="position: absolute; top: -22px; left: 50%; transform: translateX(-50%); font-size: 9px; background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 8px; white-space: nowrap; font-weight: 600;">' + hour.dayLabel + '</div>'
      }

      html += '<div style="font-size: 12px; opacity: 0.85; margin-bottom: 8px; white-space: nowrap; font-weight: 500;">' + timeLabel + '</div>'
      html += '<div style="margin-bottom: 8px;">' + weatherSvg(hour.weather, 28) + '</div>'
      html += '<div style="font-size: 15px; font-weight: 600;">' + hour.temp + '°</div>'
      html += '</div>'
    }

    html += '</div></div>'
  }

  // 7天预报
  html += '<div style="background: rgba(255,255,255,0.12); border-radius: 20px; padding: 16px; margin: 0 16px 16px 16px; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.08);">'
  html += '<div style="display: flex; align-items: center; gap: 8px; font-size: 14px; opacity: 0.9; margin-bottom: 14px; font-weight: 600; letter-spacing: 0.5px;"><span>' + iconSvg('mdi:calendar-week', 16) + '</span>7天预报</div>'
  html += '<div style="display: flex; flex-direction: column; gap: 6px;">'

  // 计算温度范围
  var minTemp = 100, maxTemp = -100
  for (var m = 0; m < forecast.length; m++) {
    if (forecast[m].tempLow < minTemp) minTemp = forecast[m].tempLow
    if (forecast[m].tempHigh > maxTemp) maxTemp = forecast[m].tempHigh
  }
  var tempRange = maxTemp - minTemp || 1

  for (var n = 0; n < forecast.length; n++) {
    var day = forecast[n]
    var dayLabel = n === 0 ? '今天' : (n === 1 ? '明天' : day.weekday)
    var todayStyle = n === 0 ? 'background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.15);' : 'background: rgba(255,255,255,0.04);'

    html += '<div style="display: grid; grid-template-columns: 70px 1fr 50px; align-items: center; gap: 10px; padding: 12px; border-radius: 14px; transition: all 0.3s ease; border: 1px solid transparent; ' + todayStyle + '">'

    // 日期信息
    html += '<div style="display: flex; flex-direction: column; gap: 2px;">'
    html += '<div style="font-size: 14px; font-weight: 600;">' + dayLabel + '</div>'
    html += '<div style="font-size: 11px; opacity: 0.6;">' + day.date + '</div>'
    html += '</div>'

    // 温度条
    var leftPercent = ((day.tempLow - minTemp) / tempRange) * 100
    var widthPercent = ((day.tempHigh - day.tempLow) / tempRange) * 100
    if (widthPercent < 10) widthPercent = 10

    html += '<div style="display: flex; align-items: center; gap: 8px;">'
    html += '<span style="font-size: 14px; opacity: 0.75; width: 24px; text-align: right; color: #cce5ff;">' + day.tempLow + '°</span>'
    html += '<span style="flex: 1; height: 5px; background: rgba(255,255,255,0.15); border-radius: 3px; position: relative; min-width: 30px;">'
    html += '<span style="position: absolute; top: 0; height: 100%; background: linear-gradient(90deg, #74b9ff 0%, #fd79a8 100%); border-radius: 3px; box-shadow: 0 0 8px rgba(253,121,168,0.4); left: ' + leftPercent + '%; width: ' + widthPercent + '%;"></span>'
    html += '</span>'
    html += '<span style="font-size: 14px; font-weight: 600; width: 24px; text-align: left; color: #ffcccc;">' + day.tempHigh + '°</span>'
    html += '</div>'

    // 天气图标和文字
    html += '<div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">'
    html += '<div>' + weatherSvg(day.weather, 28) + '</div>'
    html += '<div style="font-size: 11px; opacity: 0.85; white-space: nowrap;">' + day.weatherName + '</div>'
    html += '</div>'

    html += '</div>'
  }

  html += '</div></div></div>'

  container.innerHTML = html

  // 添加鼠标拖拽滚动支持
  var scrollContainer = container.querySelector('.hourly-scroll-container')
  if (scrollContainer) {
    var isDown = false
    var startX
    var scrollLeft

    scrollContainer.addEventListener('mousedown', function(e) {
      isDown = true
      scrollContainer.style.cursor = 'grabbing'
      startX = e.pageX - scrollContainer.offsetLeft
      scrollLeft = scrollContainer.scrollLeft
    })

    scrollContainer.addEventListener('mouseleave', function() {
      isDown = false
      scrollContainer.style.cursor = 'grab'
    })

    scrollContainer.addEventListener('mouseup', function() {
      isDown = false
      scrollContainer.style.cursor = 'grab'
    })

    scrollContainer.addEventListener('mousemove', function(e) {
      if (!isDown) return
      e.preventDefault()
      var x = e.pageX - scrollContainer.offsetLeft
      var walk = (x - startX) * 2
      scrollContainer.scrollLeft = scrollLeft - walk
    })
  }
}

// ============ 第五部分：自动注册和初始化 ============

// 注册天气APP到小手机系统
// ============ 注册到小手机系统 ============
(function() {
  console.log('[天气系统] 脚本开始加载...');

  function registerWeatherApp() {
    if (typeof window.parent.PhoneSystem === 'undefined' ||
        typeof window.parent.PhoneSystem.registerRenderer !== 'function') {
      console.log('[天气系统] 等待 PhoneSystem 初始化...');
      setTimeout(registerWeatherApp, 100);
      return;
    }

    console.log('[天气系统] PhoneSystem 已就绪，开始注册天气APP');

    // 注册APP
    window.parent.PhoneSystem.registerApp({
      id: 'weather',
      name: '天气',
      icon: '<img src="https://api.iconify.design/mdi:weather-partly-cloudy.svg?color=%234A90D9" style="width:28px;height:28px;">',
      order: 2,
      category: 'system'
    });

    // 注册渲染器
    window.parent.PhoneSystem.registerRenderer('weather', renderWeatherApp);

    // 导出天气系统到全局
    window.parent.PhoneSystem.weatherSystem = WeatherSystem;

    console.log('[天气系统] 天气APP注册完成');
  }

  // 延迟注册，确保 PhoneSystem 已加载
  setTimeout(registerWeatherApp, 500);
})();

// 导出给外部使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WeatherSystem: WeatherSystem,
    WeatherGenerator: WeatherGenerator,
    renderWeatherApp: renderWeatherApp
  }
}

