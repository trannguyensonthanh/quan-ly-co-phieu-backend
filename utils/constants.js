// utils/constants.js
// Hàm xử lý recordset: trim các chuỗi trong object, trả về 1 object hoặc mảng object

export const processRecordset = (recordset, returnSingle = false) => {
  if (!recordset || recordset.length === 0) {
    return returnSingle ? null : [];
  }

  const trimData = (data) =>
    Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        typeof value === 'string' ? value.trim() : value,
      ])
    );

  if (returnSingle) {
    return trimData(recordset[0]);
  }

  return recordset.map(trimData);
};
