# 업무관리 (Windows 데스크톱, Electron)

개인 업무 체크리스트 프로그램. 흐름: **업무 입력 → 담당자 지정 → 날짜 지정 → 체크 → 자동 저장**.

## 0. 가장 쉬운 실행 방법 (exe 빌드 없이 바로 쓰기)

Node.js(https://nodejs.org)만 설치되어 있으면, `npm install`/`npm run dist` 없이도 바로 쓸 수 있다.

1. `업무관리` 폴더의 **`run.bat`**을 더블클릭 — 처음 실행 시 자동으로 `npm install`을 하고 앱을 띄운다(몇 분 걸릴 수 있음). 이후 실행은 바로 뜬다.
2. **`create_shortcut.bat`**을 한 번 더블클릭하면 바탕화면에 "업무관리" 아이콘이 생긴다. 그 다음부터는 **바탕화면 아이콘만 더블클릭**하면 된다.

진짜 설치형/포터블 exe가 필요하면 7번(빌드·배포) 참고.

## 1. 프로젝트 폴더 구조

```
업무관리/
├─ run.bat                         # 더블클릭으로 바로 실행(최초 1회 자동 설치)
├─ create_shortcut.bat             # 바탕화면에 아이콘 생성 (create_shortcut.ps1 호출)
├─ create_shortcut.ps1
├─ package.json
├─ main.js          # 창 생성, 파일 저장/로드(ipcMain.handle), 단일 인스턴스
├─ preload.js       # window.api 노출 (contextBridge)
├─ src/
│  └─ store.js      # 안전한 저장/로드(tmp→rename, 깨진 JSON 보존)
├─ renderer/
│  ├─ index.html
│  ├─ style.css
│  ├─ logic.js      # 정렬/필터/날짜/id 순수 함수 (렌더러 + node --test 공용)
│  └─ app.js        # 화면, 입력, 필터, 렌더링
├─ assets/
│  └─ icon.ico
└─ test/
   ├─ logic.test.js # 정렬/필터/날짜 단위 테스트
   ├─ store.test.js # 저장/로드 단위 테스트
   └─ e2e.spec.js   # Playwright _electron E2E (Windows에서 실행)
```

## 2. 사용 기술과 버전

- Electron `44.4.5`
- electron-builder `26.15.3`
- Playwright `1.63.0` (E2E, devDependency)
- 런타임 외부 라이브러리/CDN/웹폰트 없음 (순수 HTML/CSS/JS)

## 3. exe 파일 위치 (Windows PC에서 `npm install && npm run dist` 실행 후)

- 설치형: `dist/업무관리 Setup 1.0.0.exe`
- 포터블: `dist/업무관리 1.0.0 Portable.exe`

## 4. 설치형 실행 방법

1. `업무관리 Setup 1.0.0.exe` 더블클릭
2. SmartScreen 경고가 뜨면 "추가 정보" → "실행" (9번 참고)
3. 설치 경로 선택 후 설치 → 바탕화면/시작 메뉴 "업무관리" 바로가기 실행

## 5. 포터블 실행 방법

`업무관리 1.0.0 Portable.exe`를 원하는 폴더(USB 등)에 두고 더블클릭 실행. 설치 불필요.

## 6. 업무 데이터 실제 저장 위치

`%APPDATA%\업무관리\tasks.json`

탐색기 주소창에 `%APPDATA%\업무관리`를 입력하면 바로 이동한다. (설치형/포터블 모두 동일 위치)

## 7. 다른 PC로 옮기는 방법

기존 PC의 `%APPDATA%\업무관리\tasks.json`을 복사 → 새 PC의 같은 경로(`%APPDATA%\업무관리\`)에 붙여넣기.

## 8. 업데이트 시 데이터 유지 여부

**유지된다.** `productName`(`업무관리`)과 `build.appId`(`com.taeyeon.taskmanager`)를 고정했기 때문에 `app.getPath('userData')` 경로가 버전이 올라가도 바뀌지 않는다. 또한 NSIS `deleteAppDataOnUninstall: false`로 제거 시에도 데이터 파일을 보존한다.

## 9. 코드 서명 관련 안내

이 exe는 코드 서명이 되어 있지 않아, 처음 실행 시 Windows SmartScreen이 "인식할 수 없는 앱입니다" 경고를 띄울 수 있다. 이 경우 **"추가 정보" 클릭 → "실행"** 버튼을 누르면 정상 실행된다.

## 10. 자동 테스트 결과 / 수동 체크리스트

### 자동 테스트 (이 클라우드 개발 환경에서 실행 완료)

```
$ npm test   # node --test test/*.test.js
tests 12
pass 12
fail 0
```

- 정렬(미완료 우선 → 날짜 오름차순 → id 오름차순), 상태×담당자 필터 조합, 로컬 기준 오늘 날짜(UTC 변환 문제 없음), id 충돌 시 증가 처리 — `test/logic.test.js`
- 저장→재로드 일치, 파일 없음→빈 배열 생성, 깨진 JSON→`tasks.broken-*.json`으로 보존 후 초기화, 저장 중단 시 원본 보존(tmp→rename 방식) — `test/store.test.js`

### 실행하지 못한 항목 (환경 제약 — 직접 실행해야 함)

이 작업은 GUI/디스플레이가 없는 리눅스 클라우드 환경에서 진행되어 아래는 **실행하지 못했다.** "됐다"고 보고하지 않고 아래에 넘긴다.

- `npm install` 후 `npm start`로 실제 Electron 창 동작 확인
- `test/e2e.spec.js` (Playwright `_electron.launch()`) 실행 — 코드는 작성했으나 미실행. Windows에서 `npx playwright test test/e2e.spec.js`로 실행 필요
- `npm run dist` 실행 및 `dist/`에 설치형·포터블 두 exe 생성 확인 — **반드시 Windows PC에서 실행**(NSIS는 Windows 빌드 필요)
- 아이콘(`assets/icon.ico`)은 PIL로 생성한 256×256 포함 단순 파란 사각형+체크 아이콘 (원하는 디자인으로 교체 가능)

### 사용자 수동 체크리스트

1. 포터블 exe 더블클릭 실행
2. 설치형 설치 → 바탕화면/시작 메뉴 바로가기로 실행
3. 업무 추가(Enter키), 담당자 유지 확인
4. 완료 체크 / 해제, 취소선 표시 확인
5. 삭제 확인창(`confirm`) 동작 확인
6. 담당자 필터, 완료/미완료 필터 동작 확인
7. 종료 → 재실행 후 데이터 유지 확인
8. 인터넷(Wi-Fi/랜) 끊고 실행해도 정상 동작하는지 확인 (외부 라이브러리 없음)
9. 두 번 실행해도 창이 하나만 뜨는지 확인 (`requestSingleInstanceLock`)

## 11. 명세에 없어서 직접 판단한 부분

- **Windows에서 빌드/실행 필요**: 이 세션은 Linux 클라우드 환경이라 Electron GUI 실행, Playwright E2E 실행, `npm run dist`(NSIS/portable exe 생성)를 직접 수행할 수 없었다. 코드/스크립트/단위테스트는 모두 작성·검증했고, 위 "실행하지 못한 항목"은 Windows PC에서 `npm install` 후 실행하면 된다.
- **정렬/필터 순수 함수 위치**: `main.js`(Node 전용)와 `renderer/app.js`(sandbox, `nodeIntegration:false`)가 파일을 공유할 별도 번들러가 없으므로, 공용 순수 함수 파일(`renderer/logic.js`)을 CommonJS(`module.exports`)와 브라우저 전역(`window.Logic`) 양쪽에서 동작하도록 작성해 `node --test`와 `<script>` 태그 모두에서 재사용했다.
- **깨진 JSON 파일명 타임스탬프 형식**: 명세에 `tasks.broken-<날짜시간>.json`으로만 적혀 있어, 파일명에 안전한 ISO 형식(`tasks.broken-2026-09-24T00-00-00-000Z.json`)을 사용했다.
- **아이콘**: 명세대로 지정된 아이콘이 없어 256×256 포함 단순 아이콘(파란 사각형 + 체크 표시)을 생성해 `assets/icon.ico`에 넣었다.
