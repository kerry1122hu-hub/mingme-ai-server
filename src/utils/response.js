function ok(data) {
  return {
    ok: true,
    data,
  };
}

function fail(error, code = 'UNKNOWN_ERROR', extra = {}) {
  return {
    ok: false,
    code,
    error,
    ...extra,
  };
}

module.exports = {
  ok,
  fail,
};
