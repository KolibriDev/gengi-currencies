import { parseString } from 'xml2js'
import fetch from 'node-fetch'

import getSymbol from './symbols'

const parseXml = (xmlString) => new Promise((resolve, reject) => {
  parseString(xmlString, { explicitRoot: false }, (err, result) => {
    if (err || !result.hasOwnProperty('Rate') || result.Status[0].ResultCode[0] != '0') {
      reject(err)
    }

    resolve(result)
  })
})

const formatCurrencyName = (providedName) => {
  // Change 'dalur, bandarískur' to 'bandarískur dalur'
  const parts = providedName.split(',')
  let value = parts.length > 1 ? `${parts[1].trim()} ${parts[0].trim()}` : parts[0]

  if (value.includes(' ')) {
    // Remove duplicates in value, e.g. 'sterlingspund pund' to 'sterlingspund'
    const split = value.split(' ')
    const shortName = split[split.length - 1]
    value = value.replace((`${shortName} ${shortName}`), shortName)
  }

  // Uppercase first letter
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}


export default async (req, res) => {
  try {
    const fetchResult = await fetch('https://www.borgun.is/Currency/Default.aspx?function=all')
    const xmlString = await fetchResult.text()
    const parsedXml = await parseXml(xmlString)

    const currencies = {}
    parsedXml.Rate
      .sort((a, b) => a.CurrencyCode[0].localeCompare(b.CurrencyCode[0]))
      .forEach((currency) => {
        const code = currency.CurrencyCode[0]

        if (currencies[code]) {
          // Already set, just add the country
          currencies[code].countries = [...currencies[code].countries, currency.Country[0]].sort()
          return
        }

        currencies[code] = {
          code: code,
          symbol: getSymbol(code),
          name: formatCurrencyName(currency.CurrencyDescription[0]),
          rate: Number(currency.CurrencyRate[0]),
          countries: [currency.Country[0]]
        }
      })

    const date = parsedXml.Rate[0].RateDate[0];
    const [day, month, year] = date.split('.')
    const dayInMS = 1000 * 60 * 60 * 24;

    const expires = new Date(year, Number(month - 1), day ).getTime() + dayInMS

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin' : 'https://gengi.is',
      'Access-Control-Request-Method' : 'GET',
      'Cache-Control': `s-maxage=${(expires - new Date().getTime()) / 1000}`
    })
    res.end(JSON.stringify({
      currencyDate: date,
      expires: Number(expires / 1000),
      list: currencies,
    }))
  } catch (error) {
    console.log('Error', error)
    res.writeHead(500)
    res.end('Something went wrong')
  }
}
