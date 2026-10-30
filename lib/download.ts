/** Hand the user a text file, built in the browser. Nothing is uploaded anywhere. */
export function downloadText(name: string, text: string, type = "text/csv;charset=utf-8;") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
