let token = sessionStorage.getItem("token");

export const setToken = (t) => {
  token = t;
  t ? sessionStorage.setItem("token", t) : sessionStorage.removeItem("token");
};

export async function api(path, { method = "GET", json, form } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (json) headers["Content-Type"] = "application/json";
  const res = await fetch(path, { method, headers, body: form || (json && JSON.stringify(json)) });
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) {
    const d = data?.detail;
    throw new Error(Array.isArray(d) ? d.map((e) => e.msg.replace("Value error, ", "")).join(". ") : d || "Something went wrong.");
  }
  if (data === null) throw new Error("Unexpected server response. Check that the backend is running.");
  return data;
}
