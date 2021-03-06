const test = require('tape')
const ssbKeys = require('ssb-keys')
const path = require('path')
const rimraf = require('rimraf')
const mkdirp = require('mkdirp')
const validate = require('ssb-validate')
const pull = require('pull-stream')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')

const { author } = require('../operators')

const dir = '/tmp/ssb-db2-basic'

rimraf.sync(dir)
mkdirp.sync(dir)

const keys = ssbKeys.loadOrCreateSync(path.join(dir, 'secret'))

let sbot = SecretStack({ appKey: caps.shs })
  .use(require('../'))
  .use(require('../compat/ebt'))
  .call(null, {
    keys,
    path: dir,
  })
let db = sbot.db

test('Base', (t) => {
  const posts = []
  for (var i = 0; i < 30; ++i) posts.push({ type: 'post', text: 'Testing!' })

  let j = 0

  pull(
    pull.values(posts),
    pull.asyncMap(db.publish),
    pull.asyncMap((postMsg, cb) => {
      if (j++ % 3 === 0) {
        db.onDrain('ebt', () => {
          sbot.getAtSequence([keys.id, j], (err, msg) => {
            t.error(err, 'no err')
            t.equal(msg.key, postMsg.key)
            cb(err)
          })
        })
      } else cb()
    }),
    pull.collect((err) => {
      t.end()
    })
  )
})

test('get', (t) => {
  const post = { type: 'post', text: 'Testing!' }

  db.publish(post, (err, postMsg) => {
    t.error(err, 'no err')
    t.equal(postMsg.value.content.text, post.text, 'text correct')

    db.get(postMsg.key, (err, getMsg) => {
      t.error(err, 'no err')
      t.deepEqual(postMsg.value, getMsg, 'msg value correct')
      t.end()
    })
  })
})

test('getStatus', (t) => {
  db.onDrain('ebt', () => {
    const stats = db.getStatus().value
    t.pass(JSON.stringify(stats))
    t.ok(stats.log)
    t.ok(stats.jit)
    t.ok(stats.indexes)
    t.true(stats['log'] > 0)
    t.equal(stats.jit['seq'], stats['log'])
    t.equal(stats.indexes['base'], stats['log'])
    t.equal(stats.indexes['ebt'], stats['log'])
    t.end()
  })
})

test('get missing key', (t) => {
  const post = { type: 'post', text: 'Testing!' }

  db.publish(post, (err, postMsg) => {
    t.error(err, 'no err')

    db.get('%fake', (err, getMsg) => {
      t.equal(err.message, 'Key not found in database %fake')
      t.end()
    })
  })
})

test('getMsg', (t) => {
  const post = { type: 'post', text: 'Testing!' }

  db.publish(post, (err, postMsg) => {
    t.error(err, 'no err')
    t.equal(postMsg.value.content.text, post.text, 'text correct')

    db.getMsg(postMsg.key, (err, getMsg) => {
      t.error(err, 'no err')
      t.deepEqual(postMsg, getMsg, 'msg value correct')
      t.end()
    })
  })
})

test('delete single', (t) => {
  const post = { type: 'post', text: 'Testing!' }

  db.publish(post, (err, postMsg) => {
    t.error(err, 'no err')
    t.equal(postMsg.value.content.text, post.text, 'text correct')

    db.get(postMsg.key, (err, getMsg) => {
      t.error(err, 'no err')
      t.equal(postMsg.value.content.text, getMsg.content.text, 'text correct')

      db.del(postMsg.key, (err) => {
        t.error(err, 'no err')

        db.get(postMsg.key, (err, msg) => {
          t.equal(msg, undefined, 'msg gone')
          t.end()
        })
      })
    })
  })
})

test('delete all', (t) => {
  const post = { type: 'post', text: 'Testing!' }
  const post2 = { type: 'post', text: 'Testing 2!' }

  db.publish(post, (err) => {
    t.error(err, 'no err')

    db.publish(post2, (err) => {
      t.error(err, 'no err')

      db.getJITDB().all(author(keys.id), 0, false, false, (err, results) => {
        t.error(err, 'no err')
        t.equal(results.length, 30 + 5, 'got both new messages')

        db.deleteFeed(keys.id, (err) => {
          t.error(err, 'no err')

          db.getJITDB().all(
            author(keys.id),
            0,
            false,
            false,
            (err, results) => {
              t.error(err, 'no err')
              t.equal(results.length, 0, 'gone')
              t.end()
            }
          )
        })
      })
    })
  })
})

test('validate needs to load', (t) => {
  const post = { type: 'post', text: 'Testing!' }
  const post2 = { type: 'post', text: 'Testing 2!' }

  db.onDrain(() => {
    sbot.close(() => {
      sbot = SecretStack({ appKey: caps.shs })
        .use(require('../'))
        .use(require('../compat/ebt'))
        .call(null, {
          keys,
          path: dir,
        })
      db = sbot.db

      // make sure we can post from cold boot
      db.publish(post, (err, msg) => {
        t.error(err, 'no err')

        t.equal(msg.value.previous, null)

        db.onDrain(() => {
          sbot.close(() => {
            // reload
            sbot = SecretStack({ appKey: caps.shs })
              .use(require('../'))
              .use(require('../compat/ebt'))
              .call(null, {
                keys,
                path: dir,
              })
            db = sbot.db

            // make sure we have the correct previous
            db.publish(post2, (err, msg2) => {
              t.error(err, 'no err')
              t.equal(msg.key, msg2.value.previous)
              sbot.close(t.end)
            })
          })
        })
      })
    })
  })
})
