from __future__ import division, print_function
import os
import sys
from scipy.spatial import ConvexHull
from collections import OrderedDict
from qtpy import QtWidgets, QtCore, QtGui
try:
    from .version_compat import StrictVersion  # distutils was removed in Python 3.12
except ImportError:
    from version_compat import StrictVersion
import numpy
import tifffile
import xlrd
import re
import math
import pyqtgraph
from skimage.draw import polygon
from pyqtgraph.Qt import QtCore, QtGui
import difflib
import pyqtgraph.opengl
import inspect
from scipy.spatial import Delaunay
import pyqtgraph.console
from pyqtgraph.dockarea import *
from collections import OrderedDict
try:
    from .version_compat import StrictVersion  # distutils was removed in Python 3.12
except ImportError:
    from version_compat import StrictVersion
import struct
from collections import defaultdict
from types import FunctionType
import glob
import zlib
import time
import warnings
import datetime
import collections
from fractions import Fraction
from xml.etree import cElementTree