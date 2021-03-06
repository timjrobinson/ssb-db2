const pull = require('pull-stream')

// exports.name is blank to merge into global namespace

exports.manifest = {
  publish: 'async',
  whoami: 'sync',
  createWriteStream: 'sink',
}

exports.init = function (sbot, config) {
  sbot.publish = sbot.db.publish
  sbot.whoami = () => ({ id: sbot.id })
  sbot.ready = () => true
  sbot.keys = config.keys
  sbot.createWriteStream = function createWriteStream(cb) {
    return pull(
      pull.asyncMap(sbot.db.add),
      pull.drain(
        () => {},
        cb ||
          ((err) => {
            if (err) throw err
          })
      )
    )
  }
}
