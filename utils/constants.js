export const processRecordset = (recordset, returnSingle = false) => {
  if (!recordset || recordset.length === 0) {
    return returnSingle ? null : [];
  }

  const trimData = (data) =>
    Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        typeof value === "string" ? value.trim() : value,
      ])
    );

  if (returnSingle) {
    // Trả về đối tượng đầu tiên đã được trim
    return trimData(recordset[0]);
  }

  // Trả về toàn bộ mảng đã được trim
  return recordset.map(trimData);
};
