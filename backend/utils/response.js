// 统一返回结构：{ code: 0/1, msg, data }
// code === 0 表示成功，code === 1 表示失败

function success(res, data, msg = 'success') {
  return res.json({
    code: 0,
    msg,
    data
  });
}

function error(res, msg, code = 400) {
  return res.status(code).json({
    code: 1,
    msg,
    data: null
  });
}

module.exports = { success, error };
