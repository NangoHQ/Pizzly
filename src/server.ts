import vhost from 'vhost'
import express from 'express'
import App from './app'
import functions from './functions/router' // proxyFunction
import errorHandler from './errorHandler'
import 'ejs'

import authV3, { authHostRouter } from './auth/v3/router'
import { AUTH_VHOST, PROXY_VHOST } from './constants'
export const BUID = 'bearerUid'

import { cors } from './proxy/cors'
import resourceNotFound from './resourceNotFound'

// simulates variables sent by API gateway
const baseApp = express()
const app = App(baseApp)

/******* API ******/

// console.log(express.static(`${__dirname}./views`))
// const viewsDir = path.join(__dirname, './views')
const viewsDir = process.env.NODE_ENV !== 'production' ? './dist/views' : './views'

app.engine('html', require('ejs').renderFile)
app.set('view engine', 'html')
app.set('views', viewsDir)

console.log('Auth VHost:', AUTH_VHOST)
app.use(vhost(AUTH_VHOST, authHostRouter()))

console.log('Proxy VHost:', PROXY_VHOST)
// app.use(vhost(PROXY_VHOST, proxyFunction()))

app.use('/v2/auth', cors, authV3())

app.use('/api/v4/functions', cors, functions())
app.use('/api/v5/functions', cors, functions())

app.use(errorHandler)

// catch 404s
app.use(resourceNotFound)

app.listen(process.env.PORT || 3000, () => {
  console.log('Integration Service app listening on port', process.env.PORT || 3000)
})
