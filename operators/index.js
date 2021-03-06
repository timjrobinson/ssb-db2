const jitdbOperators = require('jitdb/operators')
const {
  seekType,
  seekAuthor,
  seekChannel,
  seekRoot,
  seekFork,
  seekPrivate,
  seekMeta,
  seekVoteLink,
  seekMentions,
  pluckLink,
  seekContact,
  seekBranch,
  seekAbout,
} = require('../seekers')
const { and, equal, includes, deferred } = jitdbOperators

function key(msgId) {
  return deferred((meta, cb) => {
    meta.db.onDrain('keys', () => {
      meta.db.getIndex('keys').getMsgByKey(msgId, cb)
    })
  })
}

function type(value) {
  return equal(seekType, value, {
    indexType: 'value_content_type',
  })
}

function author(value, opts) {
  if (opts && opts.dedicated) {
    return equal(seekAuthor, value, {
      indexType: 'value_author',
    })
  } else {
    return equal(seekAuthor, value, {
      prefix: 32,
      prefixOffset: 1,
      indexType: 'value_author',
    })
  }
}

function channel(value) {
  return equal(seekChannel, value, {
    indexType: 'value_content_channel',
  })
}

function votesFor(msgKey) {
  return and(
    type('vote'),
    equal(seekVoteLink, msgKey, {
      prefix: 32,
      prefixOffset: 1,
      useMap: true,
      indexType: 'value_content_vote_link',
    })
  )()
}

function contact(feedId) {
  return and(
    type('contact'),
    equal(seekContact, feedId, {
      prefix: 32,
      prefixOffset: 1,
      useMap: true,
      indexType: 'value_content_contact',
    })
  )()
}

function mentions(key) {
  return includes(seekMentions, key, {
    pluck: pluckLink,
    indexType: 'value_content_mentions_link',
  })
}

function about(feedId) {
  return and(
    type('about'),
    equal(seekAbout, feedId, {
      prefix: 32,
      prefixOffset: 1,
      useMap: true,
      indexType: 'value_content_about',
    })
  )
}

function hasRoot(msgKey) {
  return equal(seekRoot, msgKey, {
    prefix: 32,
    prefixOffset: 1,
    useMap: true,
    indexType: 'value_content_root',
  })
}

function hasFork(msgKey) {
  return equal(seekFork, msgKey, {
    prefix: 32,
    prefixOffset: 1,
    useMap: true,
    indexType: 'value_content_fork',
  })
}

function hasBranch(msgKey) {
  return equal(seekBranch, msgKey, {
    prefix: 32,
    prefixOffset: 1,
    useMap: true,
    indexType: 'value_content_branch',
  })
}

function isRoot() {
  return equal(seekRoot, null, {
    indexType: 'value_content_root',
  })
}

const bTrue = Buffer.alloc(1, 1)
function isPrivate() {
  return equal(seekPrivate, bTrue, { indexType: 'meta_private' })
}

function isPublic() {
  return equal(seekMeta, undefined, { indexType: 'meta' })
}

module.exports = Object.assign({}, jitdbOperators, {
  type,
  author,
  channel,
  key,
  votesFor,
  contact,
  mentions,
  about,
  hasRoot,
  hasFork,
  hasBranch,
  isRoot,
  isPrivate,
  isPublic,
})
