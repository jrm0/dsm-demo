import numpy as np
from collections.abc import Mapping


def coerce_enum_values(values: list, enum) -> list:
    """Convert a list of enum values to their integer indices.

    Accepts mixed input: string labels are mapped through the enum,
    integers are passed through unchanged.  This allows DPM to accept
    both human-readable labels from MAGIC and raw integers from legacy
    scenario files.
    """
    result = []
    for v in values:
        if isinstance(v, str):
            result.append(enum[v])
        else:
            result.append(v)
    return result

def fast_deepcopy(obj, _memo=None):
    """
    Deep-copy dicts/lists/tuples/sets and NumPy arrays.
    Leaves everything else (e.g., numbers, strings, custom objects) as-is.
    Handles cyclic references.

    The standard deep copy method for numpy arrays is very slow, as it
    goes through the array element by element. This method copies the
    entire data buffer at once, which is much faster.
    """
    if _memo is None:
        _memo = {}

    oid = id(obj)
    if oid in _memo:
        return _memo[oid]

    # NumPy arrays: clone data buffer
    if isinstance(obj, np.ndarray):
        copy_arr = obj.copy()  # preserves dtype/order/strides
        _memo[oid] = copy_arr
        return copy_arr

    # Mappings (dict and friends)
    if isinstance(obj, Mapping):
        try:
            out = obj.__class__()  # try to preserve mapping type
        except Exception:
            out = {}
        _memo[oid] = out
        for k, v in obj.items():
            # keys are usually immutable; if not, we still pass through
            out[k] = fast_deepcopy(v, _memo)
        return out

    # Lists
    if isinstance(obj, list):
        out = []
        _memo[oid] = out
        out.extend(fast_deepcopy(x, _memo) for x in obj)
        return out

    # Tuples
    if isinstance(obj, tuple):
        out = tuple(fast_deepcopy(x, _memo) for x in obj)
        _memo[oid] = out
        return out

    # Sets
    if isinstance(obj, set):
        out = set()
        _memo[oid] = out
        for x in obj:
            out.add(fast_deepcopy(x, _memo))
        return out

    # Everything else: return as-is (assumed immutable or user-managed)
    return obj

def tse_id_to_dict(tse_id: str):
    id_dict = {}
    if "e" in tse_id:
        id_parts = tse_id.split("e")
        id_dict["event_id"] = int(id_parts[1])
        tse_id = id_parts[0]
    if "s" in tse_id:
        id_parts = tse_id.split("s")
        id_dict["step_id"] = int(id_parts[1])
        tse_id = id_parts[0]
    if "t" in tse_id:
        id_dict["turn_id"] = int(tse_id.replace("t", ""))

    return id_dict