import * as dotenv from 'dotenv'
dotenv.config({
  path: `${__dirname}/../.dev.env`,
})
import run from '../src/index'

run()
