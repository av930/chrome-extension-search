# Chrome Web Store Listing Draft

## Listing Details

- Product name: multi-search
- Version: 1.0.0
- Category: Productivity
- Primary language: English (United States)
- Additional language: Korean
- Support email: av9300@gmail.com

## Short Description

Search multiple terms on a page at once with separate, color-coded highlights, quick navigation, and bookmarks.

## Full Description (English)

Find and move between several terms on a web page without replacing one search with another. multi-search adds a compact search bar directly to the page, with a separate color for each search bar.

**Search the way you need**
- Run multiple page searches at the same time and see each term's matches in its own highlight color.
- Search as you type, review match counts, and move between matches with the on-screen controls, Enter, Shift+Enter, F3, or F4.
- Use Match Case, By Word, or regular-expression matching when needed.
- Open the search bars with Ctrl+F by default, or choose another shortcut in the extension settings.

**Keep useful context close**
- Save a page and search term as a bookmark, then reopen it with the term ready to search.
- Copy selected text and expand a selection by one or three words.
- Choose the default number of search bars, first-match auto-scroll, and highlight colors.
- Search state, preferences, and bookmarks are stored locally on this device and are not synchronized across devices.

**Works with dynamic pages**
The extension can search text in open Shadow DOM trees and same-origin frames, and refresh matches when page content changes. It skips hidden text and can open a collapsed details section when navigating to a match inside it.

**Limitations**
Browser security and page structure limit what an extension can inspect. Text in cross-origin frames, closed Shadow DOM, Chrome's built-in PDF viewer, form fields, editable regions, canvas, and images is not searchable. Chrome-protected pages, including chrome:// pages and the Chrome Web Store, do not allow content-script injection. Search starts after the page has finished loading and requires at least three characters.

Questions or feedback: av9300@gmail.com

## 전체 소개 (한국어)

웹페이지에서 여러 검색어를 동시에 찾고, 각 검색어의 결과를 서로 다른 색으로 표시하세요. multi-search는 페이지 위에 검색바를 띄워 검색어를 바꾸지 않고도 결과를 비교하고 이동할 수 있게 합니다.

**필요한 방식으로 검색**
- 여러 검색바로 동시에 검색하고 검색어별 하이라이트 색상으로 결과를 구분합니다.
- 입력과 함께 검색하고 일치 건수를 확인한 뒤, 화면 버튼이나 Enter, Shift+Enter, F3, F4로 결과 사이를 이동합니다.
- 대소문자 일치, 단어 단위 검색, 정규 표현식 검색을 선택할 수 있습니다.
- 기본 Ctrl+F 단축키를 사용하거나 확장 프로그램 설정에서 다른 단축키를 지정할 수 있습니다.

**필요한 내용을 이어서 사용**
- 페이지 주소와 검색어를 북마크해 두고, 클릭 한 번으로 해당 페이지를 열어 검색어를 다시 적용합니다.
- 선택한 텍스트를 복사하고 선택 영역을 한 단어 또는 세 단어씩 확장합니다.
- 기본 검색바 개수, 첫 결과 자동 이동, 하이라이트 색상을 설정할 수 있습니다.
- 설정은 Chrome 동기화 저장소에, 북마크는 브라우저 로컬 저장소에 저장됩니다.

**동적 웹페이지 지원**
열린 Shadow DOM과 동일 출처 프레임의 텍스트를 검색할 수 있으며, 페이지 내용이 바뀌면 현재 검색을 다시 적용합니다. 숨겨진 텍스트는 검색에서 제외하고, 접힌 details 영역의 결과로 이동할 때 해당 영역을 펼칩니다.

**제한 사항**
브라우저 보안 정책과 페이지 구조에 따라 검색할 수 없는 콘텐츠가 있습니다. 교차 출처 프레임, 닫힌 Shadow DOM, Chrome 내장 PDF 뷰어, 입력 필드, 편집 영역, canvas 및 이미지의 텍스트는 검색 대상이 아닙니다. chrome:// 페이지와 Chrome 웹 스토어처럼 Chrome이 보호하는 페이지에는 스크립트를 삽입할 수 없습니다. 페이지 로딩이 완료된 뒤 검색할 수 있으며 검색어는 세 글자 이상이어야 합니다.

문의 및 의견: av9300@gmail.com

## Dashboard Review Notes

### Permission Justifications

- `storage`: Saves user preferences in Chrome Sync and bookmarks in local extension storage.
- `activeTab`: Allows the user to open the search interface on the active tab when requested from the toolbar.
- `scripting`: Supports injecting the search interface into the active tab when the user requests it.
- Site access (`http://*/*`, `https://*/*`, and `file://*/*`): The content script searches and highlights text in pages the user visits. File URL access may require the user to enable file access for the extension in Chrome settings.

### Data Handling Notes

- Page text is searched in the browser and is not retained after local processing.
- Search-bar queries and preferences, user-pinned page URLs and search terms, and the package-load timestamp are saved with `chrome.storage.local`.
- No extension data is synchronized across devices.
- The current source has no analytics or advertising code and does not send this information to a developer-operated server.
- The extension handles page text and user-saved page URLs locally; the dashboard requires an accurate privacy policy URL for these practices.
- Confirm the Chrome Web Store privacy disclosures against the final package and current implementation before submitting. If the implementation or data practices change, update these statements and the store listing.

## Before Publishing

- Upload the final packaged extension ZIP.
- Add current screenshots showing the search bars, highlights, popup settings, and bookmarks.
- Review the final permission prompts and privacy disclosures in the dashboard.
- Confirm the support email and listing languages.
- Test the uploaded package in Chrome before submitting it for review.
