/**
 * Expense Tracker API — Single-file backend
 * Stack: Express + Mongoose + MongoDB Atlas
 *
 * Install:
 * yarn add express mongoose cors
 *
 * Run:
 * node server.js
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

/* ───────────── Config ───────────── */

const MONGODB_URI =
  'mongodb+srv://maheemshahreear2_db_user:G39VpMNGbk6hzu2J@cluster0.r1tozjp.mongodb.net/expense-tracker?appName=Cluster0';

const PORT = process.env.PORT || 5000;

/* ───────────── Constants ───────────── */

const CATEGORIES = {
  expense: [
    'Food',
    'Transport',
    'Shopping',
    'Bills',
    'Health',
    'Entertainment',
    'Education',
    'Other',
  ],

  income: [
    'Salary',
    'Freelance',
    'Gift',
    'Investment',
    'Other',
  ],
};

/* ───────────── Helpers ───────────── */

const pad = (n) => String(n).padStart(2, '0');

const httpError = (status, message) =>
  Object.assign(new Error(message), { status });

const ah = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const escapeRegex = (s) =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/*
  Get timezone offset from frontend.

  Example:
  +06:00

  Because "+" can become a space in query strings,
  we convert a leading space back to "+".
*/

const getTz = (q) => {
  const v = String(q || '').replace(/^ /, '+');

  return /^[+-]\d{2}:\d{2}$/.test(v)
    ? v
    : '+00:00';
};

/* ───────────── Date Range ───────────── */

function parseRange(q) {
  const from = new Date(q.from);
  const to = new Date(q.to);

  if (
    isNaN(from) ||
    isNaN(to) ||
    from >= to
  ) {
    throw httpError(
      400,
      'Provide a valid "from" and "to" date range.'
    );
  }

  return { from, to };
}

/* ───────────── Transaction Validation ───────────── */

function cleanTransaction(body = {}) {
  const type = body.type;

  if (!['income', 'expense'].includes(type)) {
    throw httpError(
      400,
      'Type must be income or expense.'
    );
  }

  const amount = Number(body.amount);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw httpError(
      400,
      'Amount must be a number greater than 0.'
    );
  }

  if (amount > 1e12) {
    throw httpError(
      400,
      'Amount is too large.'
    );
  }

  if (!CATEGORIES[type].includes(body.category)) {
    throw httpError(
      400,
      `Pick a valid ${type} category.`
    );
  }

  const note = String(
    body.note || ''
  )
    .trim()
    .slice(0, 200);

  const date = body.date
    ? new Date(body.date)
    : new Date();

  if (isNaN(date)) {
    throw httpError(
      400,
      'Date is not valid.'
    );
  }

  return {
    type,
    amount: Math.round(amount * 100) / 100,
    category: body.category,
    note,
    date,
  };
}

/* ───────────── MongoDB Model ───────────── */

const transactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['income', 'expense'],
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },

    category: {
      type: String,
      required: true,
    },

    note: {
      type: String,
      default: '',
      maxlength: 200,
    },

    date: {
      type: Date,
      default: Date.now,
    },
  },

  {
    timestamps: true,
  }
);

transactionSchema.index({
  date: -1,
});

const Transaction =
  mongoose.model(
    'Transaction',
    transactionSchema
  );

/* ───────────── Express App ───────────── */

const app = express();

app.set('trust proxy', 1);

app.use(cors());

app.use(
  express.json({
    limit: '50kb',
  })
);

/* ───────────── Health Check ───────────── */

app.get(
  '/api/health',
  (req, res) => {
    res.json({
      ok: true,
      message: 'Expense Tracker API is running',
    });
  }
);

/* ───────────── GET Transactions ───────────── */

app.get(
  '/api/transactions',
  ah(async (req, res) => {
    const { from, to } =
      parseRange(req.query);

    const filter = {
      date: {
        $gte: from,
        $lt: to,
      },
    };

    /* Filter by type */

    if (
      ['income', 'expense'].includes(
        req.query.type
      )
    ) {
      filter.type = req.query.type;
    }

    /* Filter by category */

    if (req.query.category) {
      filter.category =
        String(req.query.category);
    }

    /* Search */

    const search = String(
      req.query.search || ''
    )
      .trim()
      .slice(0, 60);

    if (search) {
      const rx = new RegExp(
        escapeRegex(search),
        'i'
      );

      filter.$or = [
        {
          note: rx,
        },
        {
          category: rx,
        },
      ];
    }

    /* Limit */

    const limit = Math.min(
      parseInt(req.query.limit, 10) || 200,
      500
    );

    const transactions =
      await Transaction.find(filter)
        .sort({
          date: -1,
          createdAt: -1,
        })
        .limit(limit);

    res.json({
      transactions,
    });
  })
);

/* ───────────── CREATE Transaction ───────────── */

app.post(
  '/api/transactions',
  ah(async (req, res) => {
    const cleaned =
      cleanTransaction(req.body);

    const transaction =
      await Transaction.create(
        cleaned
      );

    res.status(201).json({
      transaction,
    });
  })
);

/* ───────────── UPDATE Transaction ───────────── */

app.put(
  '/api/transactions/:id',
  ah(async (req, res) => {
    if (
      !mongoose.isValidObjectId(
        req.params.id
      )
    ) {
      throw httpError(
        404,
        'Transaction not found.'
      );
    }

    const cleaned =
      cleanTransaction(req.body);

    const transaction =
      await Transaction.findByIdAndUpdate(
        req.params.id,
        cleaned,
        {
          new: true,
          runValidators: true,
        }
      );

    if (!transaction) {
      throw httpError(
        404,
        'Transaction not found.'
      );
    }

    res.json({
      transaction,
    });
  })
);

/* ───────────── DELETE Transaction ───────────── */

app.delete(
  '/api/transactions/:id',
  ah(async (req, res) => {
    if (
      !mongoose.isValidObjectId(
        req.params.id
      )
    ) {
      throw httpError(
        404,
        'Transaction not found.'
      );
    }

    const transaction =
      await Transaction.findByIdAndDelete(
        req.params.id
      );

    if (!transaction) {
      throw httpError(
        404,
        'Transaction not found.'
      );
    }

    res.json({
      message: 'Transaction deleted.',
    });
  })
);

/* ───────────── Statistics ───────────── */

const totalOf = (rows, type) =>
  (
    rows.find(
      (r) => r._id === type
    ) || {}
  ).total || 0;

app.get(
  '/api/stats',
  ah(async (req, res) => {
    const { from, to } =
      parseRange(req.query);

    const tz = getTz(
      req.query.tz
    );

    const match = {
      date: {
        $gte: from,
        $lt: to,
      },
    };

    const [
      totals,
      byCategory,
      daily,
      allTime,
    ] = await Promise.all([
      /* Income / Expense totals */

      Transaction.aggregate([
        {
          $match: match,
        },

        {
          $group: {
            _id: '$type',
            total: {
              $sum: '$amount',
            },
          },
        },
      ]),

      /* Category totals */

      Transaction.aggregate([
        {
          $match: match,
        },

        {
          $group: {
            _id: {
              type: '$type',
              category: '$category',
            },

            total: {
              $sum: '$amount',
            },
          },
        },

        {
          $sort: {
            total: -1,
          },
        },
      ]),

      /* Daily totals */

      Transaction.aggregate([
        {
          $match: match,
        },

        {
          $group: {
            _id: {
              day: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$date',
                  timezone: tz,
                },
              },

              type: '$type',
            },

            total: {
              $sum: '$amount',
            },
          },
        },

        {
          $sort: {
            '_id.day': 1,
          },
        },
      ]),

      /* All-time totals */

      Transaction.aggregate([
        {
          $group: {
            _id: '$type',

            total: {
              $sum: '$amount',
            },
          },
        },
      ]),
    ]);

    /* Build daily map */

    const dayMap = {};

    daily.forEach((row) => {
      const day = row._id.day;

      if (!dayMap[day]) {
        dayMap[day] = {
          day,
          income: 0,
          expense: 0,
        };
      }

      dayMap[day][
        row._id.type
      ] = row.total;
    });

    const income =
      totalOf(totals, 'income');

    const expense =
      totalOf(totals, 'expense');

    res.json({
      income,

      expense,

      balance:
        income - expense,

      allTimeBalance:
        totalOf(
          allTime,
          'income'
        ) -
        totalOf(
          allTime,
          'expense'
        ),

      byCategory:
        byCategory.map((row) => ({
          type: row._id.type,
          category:
            row._id.category,
          total: row.total,
        })),

      daily:
        Object.values(dayMap),
    });
  })
);

/* ───────────── Monthly Helper ───────────── */

const monthStart = (
  y,
  m,
  tz
) => {
  const d = new Date(
    Date.UTC(
      y,
      m - 1,
      1
    )
  );

  return new Date(
    `${d.getUTCFullYear()}-${pad(
      d.getUTCMonth() + 1
    )}-01T00:00:00${tz}`
  );
};

/* ───────────── Monthly Summary ───────────── */

app.get(
  '/api/summary/monthly',
  ah(async (req, res) => {
    const y = parseInt(
      req.query.year,
      10
    );

    const m = parseInt(
      req.query.month,
      10
    );

    if (
      !y ||
      !m ||
      m < 1 ||
      m > 12
    ) {
      throw httpError(
        400,
        'Provide a valid year and month.'
      );
    }

    const tz = getTz(
      req.query.tz
    );

    const start =
      monthStart(
        y,
        m,
        tz
      );

    const end =
      monthStart(
        y,
        m + 1,
        tz
      );

    const prevStart =
      monthStart(
        y,
        m - 1,
        tz
      );

    const trendStart =
      monthStart(
        y,
        m - 5,
        tz
      );

    /* Income / expense aggregation */

    const byType = (
      a,
      b
    ) => [
      {
        $match: {
          date: {
            $gte: a,
            $lt: b,
          },
        },
      },

      {
        $group: {
          _id: '$type',

          total: {
            $sum: '$amount',
          },
        },
      },
    ];

    const [
      current,
      previous,
      categories,
      trendRaw,
    ] = await Promise.all([
      /* Current month */

      Transaction.aggregate(
        byType(start, end)
      ),

      /* Previous month */

      Transaction.aggregate(
        byType(
          prevStart,
          start
        )
      ),

      /* Current month categories */

      Transaction.aggregate([
        {
          $match: {
            type: 'expense',

            date: {
              $gte: start,
              $lt: end,
            },
          },
        },

        {
          $group: {
            _id: '$category',

            total: {
              $sum: '$amount',
            },
          },
        },

        {
          $sort: {
            total: -1,
          },
        },
      ]),

      /* Six-month trend */

      Transaction.aggregate([
        {
          $match: {
            date: {
              $gte: trendStart,
              $lt: end,
            },
          },
        },

        {
          $group: {
            _id: {
              month: {
                $dateToString: {
                  format: '%Y-%m',
                  date: '$date',
                  timezone: tz,
                },
              },

              type: '$type',
            },

            total: {
              $sum: '$amount',
            },
          },
        },
      ]),
    ]);

    /* Current totals */

    const income =
      totalOf(
        current,
        'income'
      );

    const expense =
      totalOf(
        current,
        'expense'
      );

    /* Previous expense */

    const prevExpense =
      totalOf(
        previous,
        'expense'
      );

    /* Days in month */

    const daysInMonth =
      new Date(
        Date.UTC(
          y,
          m,
          0
        )
      ).getUTCDate();

    const now =
      new Date();

    const elapsed =
      now < start
        ? 1
        : now >= end
          ? daysInMonth
          : Math.min(
              daysInMonth,
              Math.floor(
                (now - start) /
                  86400000
              ) + 1
            );

    /* Six-month trend */

    const trend = [];

    for (
      let i = 5;
      i >= 0;
      i--
    ) {
      const d =
        new Date(
          Date.UTC(
            y,
            m - 1 - i,
            1
          )
        );

      const key =
        `${d.getUTCFullYear()}-${pad(
          d.getUTCMonth() + 1
        )}`;

      const get = (
        type
      ) =>
        (
          trendRaw.find(
            (row) =>
              row._id.month ===
                key &&
              row._id.type ===
                type
          ) || {}
        ).total || 0;

      trend.push({
        month: key,

        income:
          get('income'),

        expense:
          get('expense'),
      });
    }

    /* Final response */

    res.json({
      month:
        `${y}-${pad(m)}`,

      income,

      expense,

      net:
        income - expense,

      avgDailySpend:
        Math.round(
          (expense / elapsed) *
            100
        ) / 100,

      topCategory:
        categories[0]
          ? {
              category:
                categories[0]
                  ._id,

              total:
                categories[0]
                  .total,
            }
          : null,

      prevExpense,

      changePct:
        prevExpense > 0
          ? Math.round(
              ((expense -
                prevExpense) /
                prevExpense) *
                100
            )
          : null,

      byCategory:
        categories.map(
          (row) => ({
            category:
              row._id,

            total:
              row.total,
          })
        ),

      trend,
    });
  })
);

/* ───────────── 404 Handler ───────────── */

app.use(
  (req, res) => {
    res
      .status(404)
      .json({
        message:
          'Route not found.',
      });
  }
);

/* ───────────── Error Handler ───────────── */

app.use(
  (
    err,
    req,
    res,
    next
  ) => {
    if (
      err.name ===
        'ValidationError' ||
      err.name ===
        'CastError'
    ) {
      return res
        .status(400)
        .json({
          message:
            err.message,
        });
    }

    if (
      err.type ===
      'entity.parse.failed'
    ) {
      return res
        .status(400)
        .json({
          message:
            'Invalid JSON body.',
        });
    }

    if (!err.status) {
      console.error(err);
    }

    res
      .status(
        err.status || 500
      )
      .json({
        message: err.status
          ? err.message
          : 'Something went wrong on the server.',
      });
  }
);

/* ───────────── MongoDB Connection ───────────── */

mongoose
  .connect(
    'mongodb+srv://maheemshahreear2_db_user:G39VpMNGbk6hzu2J@cluster0.r1tozjp.mongodb.net/expense-tracker?appName=Cluster0'
  )

  .then(() => {
    console.log(
      'MongoDB connected successfully.'
    );

    app.listen(
      PORT,
      () => {
        console.log(
          `Expense Tracker API running on port ${PORT}`
        );
      }
    );
  })

  .catch((err) => {
    console.error(
      'MongoDB connection failed:',
      err.message
    );

    process.exit(1);
  });