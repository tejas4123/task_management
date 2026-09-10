from rest_framework.pagination import CursorPagination, PageNumberPagination


class StandardPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 200


class TaskCursorPagination(CursorPagination):
    """Cursor pagination for the task list.

    Offset pagination degrades badly once the table is large (``OFFSET 100000``
    still scans 100k rows). Cursor pagination keeps every page a bounded index
    range scan, which is what we want at the ~5M task target.
    """

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 200
    ordering = "-id"
