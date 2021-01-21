# SSB-DB2

SSB-DB2 is a new database for secure-scuttlebutt, it is meant as a
replacement for [ssb-db]. The main reason for creating a new database
is to be able to rework some of the existing decisions without having
to be 100% backwards compatible. The main reasons are:

 - Performance, the database stores data in [bipf]
 - Replace flume with [jitdb] and specialized indexes
 - Run in the browser
 - Work well with partial replication

SSB-DB2 is a secret-stack plugin that registers itself in the db
namespace.

By default SSB-DB2 only loads a base index (indexes/base), this index
includes the basic functionality for getting messages from the log and
for doing EBT.

By default the database is stored in ~/.ssb/db2/log.bipf and indexes
are stored in ~/.ssb/db2/indexes/.

## Usage

To get the post messages of a specific author, you can do:

```js
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const {and, type, author, toCallback} = require('ssb-db2/operators')

const sbot = SecretStack({ caps })
  .use(require('ssb-db2'))
  .call(null, { path: './' })

sbot.db.query(
  and(type('post')),
  and(author('@6CAxOI3f+LUOVrbAl0IemqiS7ATpQvr9Mdw9LC4+Uv0=.ed25519')),
  toCallback((err, msgs) => {
    console.log('There are ' + msgs.length + ' messages of type "post" from arj')
    sbot.close()
  })
)
```

To get post messages that mention Alice, you can do:

```js
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const {query, and, type, author, mentions, toCallback} = require('ssb-db2/operators')

const sbot = SecretStack({ caps })
  .use(require('ssb-db2'))
  .call(null, { path: './' })

sbot.db.query(
  and(type('post'), mentions(alice.id))),
  toCallback((err, msgs) => {
    console.log('There are ' + msgs.length + ' messages')
    sbot.close()
  })
)
```

### Extra plugins

An extra index plugin that is commonly needed in SSB communities is
the **full-mentions** index. It has one method: getMessagesByMention.

Although this accomplishes the same as the previous `mentions()`
example, this plugin is meant as an example for application developers
to write their own plugins if the functionality of JITDB is not
enough. JITDB is good for indexing specific values, like
`mentions(alice.id)` which gets its own dedidated JITDB index for
`alice.id`. But when querying mentions of several feeds or several
messages, this creates many indexes, so a specialized index makes more
sense.

What `full-mentions` does is index all possible mentionable items at
once, using Leveldb instead of JITDB. You can include it and use it
like this:

```js
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const {query, and, type, author, toCallback} = require('ssb-db2/operators')
const mentions = require('ssb-db2/operators/full-mentions')

const sbot = SecretStack({ caps })
  .use(require('ssb-db2'))
  .use(require('ssb-db2/full-mentions')) // include index
  .call(null, { path: './' })

sbot.db.query(
  and(type('post'), mentions(alice.id))),
  toCallback((err, msgs) => {
    console.log('There are ' + msgs.length + ' messages')
    sbot.close()
  })
)
```

### Compatibility plugins

SSB DB2 includes a couple of plugins for backwards compatibility,
including legacy replication, ebt and publish. They can be loaded as:

```js
const SecretStack = require('secret-stack')

const sbot = SecretStack({ caps })
  .use(require('ssb-db2'))
  .use(require('ssb-db2/compat')) // include all compatibility plugins
  .call(null, {})
```

or specifically:

```js
const SecretStack = require('secret-stack')

const sbot = SecretStack({ caps })
  .use(require('ssb-db2'))
  .use(require('ssb-db2/compat/db')) // basic db compatibility
  .use(require('ssb-db2/compat/history-stream')) // legacy replication
  .use(require('ssb-db2/compat/ebt')) // ebt db helpers
  .call(null, {})
```

## Migrating from ssb-db

The flumelog used underneath ssb-db2 is different than that one in
ssb-db, this means we need to scan over the old log and copy all
messages onto the new log, if you wish to use ssb-db2 to make queries.

ssb-db2 comes with migration methods built-in, you can enable them
(they are off by default!) in your config file (or object):

```js
const SecretStack = require('secret-stack')

const config = {
  keys: keys,
  db2: {
    automigrate: true
  }
}

const sbot = SecretStack({ caps })
  .use(require('ssb-db2'))
  .use(require('ssb-db2/compat'))
  .call(null, config)
```

The above script will initiate migration as soon as the plugins are
loaded. If you wish the manually dictate when the migration starts,
don't use the `automigrate` config above, instead, call the
`migrate.start()` method yourself:

```js
sbot.db.migrate.start()
```

Note, it is acceptable to load both ssb-db and ssb-db2 plugins, the
system will still function correctly and migrate correctly:

```js
const sbot = SecretStack({ caps })
  .use(require('ssb-db'))
  .use(require('ssb-db2'))
  .use(require('ssb-db2/compat'))
  .call(null, config)
```

However, note that while the old log exists, it will be continously
migrated to the new log, and ssb-db2 forbids you to use its
database-writing APIs such as `add()`, `publish()`, `del()` and so
forth, to prevent the two logs from diverging into inconsistent
states. The old log will remain the source of truth and keep getting
copied into the new log, until the old log file does not exist
anymore.

### Migrating without including ssb-db2

Because ssb-db2 also begins indexing basic metadata once it's included
as a plugin, this may cost more (precious) CPU time. **If you are not
yet using db2 APIs** but would like to migrate the log anyway, in
preparation for later activating db2, then you can include only the
migration plugin, like this:

```js
const sbot = SecretStack({appKey: caps.shs})
  .use(require('ssb-db2/migrate'))
  .call(null, config)
```

Note that the `start` behavior is the same: you can either start it
automatically using `config.db2.automigrate` or manually like this:

```js
sbot.db2migrate.start()
```

## Methods

### get(msgId, cb)

Get a particular message value by message id.

### getMsg(msgId, cb)

Get a particular message including key by message id.

### del(msgId, cb)

Delete a specific message given the message id from the
database. Please note that this will break replication for anything
trying to get that message, like createHistoryStream for the author or
EBT. Because of this, it is not recommended to delete message with
this method unless you know exactly what you are doing.

### deleteFeed(feedId, cb)

Delete all messages of a specific feedId. Compared to `del` this
method is safe to use.

### publish(msg, cb)

Convenience method for validating and adding a message to the database
written by the feed running the secret-stack.

### add(msg, cb)

Validate and add a message value (without id and timestamp) to the
database. In the callback will be the stored message (id, timestamp,
value = original message) or err.

### addOOOStrictOrder(msg, cb)

Works quite similar to `add`. If the author is not yet known, the
message is validated without checking if the previous link is correct,
otherwise normal validation. This makes it possible to use for partial
replication to add say latest 25 messages from a feed.

### addOOO(msg, cb)

Validate without checking the previous link and add to db. Useful for
partial replication.

### getStatus

Gets the current db status, same functionality as
[db.status](https://github.com/ssbc/ssb-db#dbstatus) in ssb-db.

## Configuration

You can use ssb-config parameters to configure some aspects of ssb-db2:

```js
const config = {
  keys: keys,
  db2: {
    /**
     * Start the migration plugin automatically as soon as possible.
     * Default: false
     */
    automigrate: true,

    /**
     * An upper limit on the CPU load that ssb-db2 can use while indexing
     * and scanning. `85` means "ssb-db2 will only index when CPU load is at
     * 85% or lower".
     * Default: Infinity
     */
    maxCpu: 85,
  }
}
```

[ssb-db]: https://github.com/ssbc/ssb-db/
[bipf]: https://github.com/ssbc/bipf/
[jitdb]: https://github.com/ssb-ngi-pointer/jitdb/
