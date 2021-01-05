const test = require('tape')
const fs = require('fs')
const path = require('path')
const rimraf = require('rimraf')
const mkdirp = require('mkdirp')
const generateFixture = require('ssb-fixtures')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const ssbKeys = require('ssb-keys')
const pull = require('pull-stream')
const fromEvent = require('pull-stream-util/from-event')
const DeferredPromise = require('p-defer')
const sleep = require('util').promisify(setTimeout)
const { and, type, descending, paginate, toCallback } = require('../operators')

const dir = '/tmp/ssb-db2-benchmark'
const oldLogPath = path.join(dir, 'flume', 'log.offset')
const db2Path = path.join(dir, 'db2')
const reportPath = path.join(dir, 'benchmark.md')

const skipCreate = process.argv[2] === 'noCreate'

if (!skipCreate) {
  rimraf.sync(dir)
  mkdirp.sync(dir)

  const SEED = 'sloop'
  const MESSAGES = 100000
  const AUTHORS = 2000

  test('generate fixture with flumelog-offset', (t) => {
    generateFixture({
      outputDir: dir,
      seed: SEED,
      messages: MESSAGES,
      authors: AUTHORS,
      slim: true,
    }).then(() => {
      t.pass(`seed = ${SEED}`)
      t.pass(`messages = ${MESSAGES}`)
      t.pass(`authors = ${AUTHORS}`)
      t.true(fs.existsSync(oldLogPath), 'log.offset was created')
      fs.appendFileSync(reportPath, '## Benchmark results\n\n')
      fs.appendFileSync(reportPath, '| Part | Duration |\n|---|---|\n')
      t.end()
    })
  })
}

test('migration (using ssb-db)', async (t) => {
  rimraf.sync(db2Path)
  t.pass('delete db2 folder to start clean')

  const keys = ssbKeys.loadOrCreateSync(path.join(dir, 'secret'))
  const sbot = SecretStack({ appKey: caps.shs })
    .use(require('ssb-db'))
    .use(require('../migrate'))
    .call(null, { keys, path: dir })

  while (true) {
    const { current, target } = sbot.progress().indexes
    if (current === target) break
    else await sleep(500)
  }
  t.pass('ssb-db has finished indexing')

  await sleep(500) // some silence to make it easier to read the CPU profiler

  const ended = DeferredPromise()
  const start = Date.now()
  sbot.db2migrate.start()

  pull(
    fromEvent('ssb:db2:migrate:progress', sbot),
    pull.filter((progress) => progress === 1),
    pull.take(1),
    pull.drain(async () => {
      const duration = Date.now() - start
      t.pass(`duration: ${duration}ms`)
      fs.appendFileSync(
        reportPath,
        `| Migration (using ssb-db) | ${duration}ms |\n`
      )
      await sleep(2000) // wait for new log FS writes to finalize
      sbot.close(() => {
        ended.resolve()
      })
    })
  )

  await ended.promise
})

test('migration (alone)', async (t) => {
  rimraf.sync(db2Path)
  t.pass('delete db2 folder to start clean')

  const keys = ssbKeys.loadOrCreateSync(path.join(dir, 'secret'))
  const sbot = SecretStack({ appKey: caps.shs })
    .use(require('../migrate'))
    .call(null, { keys, path: dir })

  await sleep(500) // some silence to make it easier to read the CPU profiler

  const ended = DeferredPromise()
  const start = Date.now()
  sbot.db2migrate.start()

  pull(
    fromEvent('ssb:db2:migrate:progress', sbot),
    pull.filter((progress) => progress === 1),
    pull.take(1),
    pull.drain(async () => {
      const duration = Date.now() - start
      t.pass(`duration: ${duration}ms`)
      fs.appendFileSync(reportPath, `| Migration (alone) | ${duration}ms |\n`)
      await sleep(2000) // wait for new log FS writes to finalize
      sbot.close(() => {
        ended.resolve()
      })
    })
  )

  await ended.promise
})

test('initial indexing', async (t) => {
  const keys = ssbKeys.loadOrCreateSync(path.join(dir, 'secret'))
  const sbot = SecretStack({ appKey: caps.shs })
    .use(require('../'))
    .call(null, { keys, path: dir })

  await sleep(500) // some silence to make it easier to read the CPU profiler

  const ended = DeferredPromise()
  const start = Date.now()

  sbot.db.query(
    and(type('post')),
    descending(),
    paginate(1),
    toCallback((err, { results, total }) => {
      const duration = Date.now() - start
      t.error(err)
      if (total === 0) t.fail('should respond with msgs')
      if (results.length !== 1) t.fail('should respond with 1 msg')
      if (!results[0].value.content.text.includes('LATESTMSG'))
        t.fail('should have LATESTMSG')
      t.pass(`duration: ${duration}ms`)
      fs.appendFileSync(reportPath, `| Initial indexing | ${duration}ms |\n`)
      sbot.close(() => {
        ended.resolve()
      })
    })
  )

  await ended.promise
})