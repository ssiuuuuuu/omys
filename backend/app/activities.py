from __future__ import annotations

import secrets


MOODS = {
    "light": {"label": "가볍게", "emoji": "🙂", "description": "편하게 이야기하고 놀기"},
    "funny": {"label": "웃기게", "emoji": "😂", "description": "사진과 흑역사 남기기"},
    "dopamine": {"label": "도파민", "emoji": "⚡", "description": "랜덤, 경쟁, 제한 시간"},
}


def activity(
    activity_id: str,
    mood: str,
    title: str,
    description: str,
    duration_seconds: int | None = None,
) -> dict:
    return {
        "id": activity_id,
        "mood": mood,
        "title": title,
        "description": description,
        "duration_seconds": duration_seconds,
        "is_active": True,
    }


ACTIVITIES = [
    activity(
        "light_01",
        "light",
        "궁금했던 질문 3개씩 하기",
        "서로에게 미뤄 두었던 질문을 세 개씩 건네 보세요.",
    ),
    activity(
        "light_02",
        "light",
        "사진첩의 가장 오래된 사진 공개하기",
        "공개해도 괜찮은 가장 오래된 사진 한 장과 그때의 이야기를 나눠 보세요.",
    ),
    activity(
        "light_03",
        "light",
        "첫인상과 지금 인상 말하기",
        "서로의 첫인상과 친해진 뒤 달라진 인상을 솔직하게 말해 보세요.",
    ),
    activity(
        "light_04",
        "light",
        "최근 검색 기록 하나 보여주기",
        "개인정보가 없는 검색 기록 중 공개해도 괜찮은 하나를 골라 이유를 이야기하세요.",
    ),
    activity(
        "light_05",
        "light",
        "요즘 많이 듣는 노래 들려주기",
        "각자 요즘 가장 자주 듣는 노래 한 곡을 골라 함께 들어 보세요.",
    ),
    activity(
        "light_06",
        "light",
        "서로의 배경화면 골라주기",
        "사진첩에서 서로에게 어울리는 배경화면을 하나씩 골라 주세요.",
    ),
    activity(
        "light_07",
        "light",
        "3분 캐리커처 그리기",
        "종이 또는 메모 앱으로 서로의 특징을 살린 그림을 그려 주세요.",
        180,
    ),
    activity(
        "light_08",
        "light",
        "서로의 마음에 드는 사진 찍어주기",
        "한 사람씩 모델이 되어 가장 마음에 드는 사진을 한 장씩 남겨 주세요.",
    ),
    activity(
        "light_09",
        "light",
        "버킷리스트 하나씩 말하기",
        "언젠가 꼭 해 보고 싶은 일을 한 가지씩 말하고 이유를 나눠 보세요.",
    ),
    activity(
        "light_10",
        "light",
        "OMYS 랜덤 질문에 모두 답하기",
        "좋아하는 계절, 최근의 작은 행복, 다시 가고 싶은 순간을 차례로 답해 보세요.",
    ),
    activity(
        "funny_01",
        "funny",
        "1분 웃음 참기 대결",
        "서로 마주 보고 먼저 웃는 사람이 지는 게임입니다.",
        60,
    ),
    activity(
        "funny_02",
        "funny",
        "친구 말투 따라 하기",
        "친구 한 명의 자주 쓰는 말과 말투를 30초 동안 따라 해 보세요.",
        30,
    ),
    activity(
        "funny_03",
        "funny",
        "주변 물건 홈쇼핑",
        "주변 물건 하나를 골라 꼭 사야 할 상품처럼 1분 동안 소개하세요.",
        60,
    ),
    activity(
        "funny_04",
        "funny",
        "웃긴 프로필 사진 찍어주기",
        "서로에게 어울리는 과장된 표정과 구도로 프로필 사진을 찍어 주세요.",
    ),
    activity(
        "funny_05",
        "funny",
        "이모지로 영화 설명하기",
        "영화 제목을 말하지 않고 이모지만 보여 주며 맞혀 보세요.",
    ),
    activity(
        "funny_06",
        "funny",
        "공개 가능한 흑역사 말하기",
        "불편하지 않은 선에서 지금은 웃을 수 있는 실수담을 하나씩 나눠 보세요.",
    ),
    activity(
        "funny_07",
        "funny",
        "사진첩의 가장 웃긴 사진 찾기",
        "공개해도 괜찮은 사진 중 가장 웃긴 한 장을 골라 사연을 소개하세요.",
    ),
    activity(
        "funny_08",
        "funny",
        "뉴스 앵커처럼 상황 중계하기",
        "지금 벌어지는 일을 진지한 뉴스처럼 30초 동안 중계하세요.",
        30,
    ),
    activity(
        "funny_09",
        "funny",
        "몸으로만 제시어 설명하기",
        "말을 사용하지 않고 몸짓만으로 제시어를 설명해 보세요.",
        60,
    ),
    activity(
        "funny_10",
        "funny",
        "이상한 포즈로 단체사진 찍기",
        "모두가 서로 다른 가장 이상한 포즈를 정해 단체사진을 남겨 보세요.",
    ),
    activity(
        "dopamine_01",
        "dopamine",
        "폭죽 맞기",
        "해변가에서 폭죽을 들고 서로를 맞춰보세요.",
        600,
    ),
    activity(
        "dopamine_02",
        "dopamine",
        "뜨거운 국물에 손가락 넣기",
        "탕이나 국물에 손가락을 넣고 오랫동안 버티는 사람이 이겨요",
        30,
    ),
    activity(
        "dopamine_03",
        "dopamine",
        "날계란 맞기",
        "가위바위보를 진 사람들은 도망가고 이긴 사람이 날계란으로 맞춰요.",
        60,
    ),
    activity(
        "dopamine_04",
        "dopamine",
        "전기파리채로 맞기",
        "내기에 진 사람은 전기파리채로 맞아요",
        600,
    ),
]


ACTIVITY_BY_ID = {item["id"]: item for item in ACTIVITIES}


def activities_for_mood(mood: str) -> list[dict]:
    return [item for item in ACTIVITIES if item["mood"] == mood and item["is_active"]]


def choose_activity(mood: str, excluded_ids: set[str]) -> tuple[dict, bool]:
    pool = activities_for_mood(mood)
    available = [item for item in pool if item["id"] not in excluded_ids]
    reset = not available
    if reset:
        available = pool
    return secrets.choice(available), reset
